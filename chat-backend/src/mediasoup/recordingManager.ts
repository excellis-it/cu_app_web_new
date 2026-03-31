import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { types } from "mediasoup";

import { getOrCreateRoom, getRoomProducers } from "./mediaRoomManager";
import { recordingConfig } from "../helpers/recordingConfig";

const ffmpegBinary = process.env.FFMPEG_PATH || "ffmpeg";

type ServerStream = {
  producerId: string;
  kind: types.MediaKind;
  transport: types.PlainTransport;
  consumer: types.Consumer;
  rtpPort: number;
  rtcpPort: number;
  sdpPath: string;
};

type RecordingSession = {
  roomId: string;
  recordingId: string;
  outputPath: string;
  sdpDir: string;
  ffmpegProcess: ReturnType<typeof spawn>;
  ffmpegStderrPrefix: string;
  streams: ServerStream[];
  allocatedPorts: number[];
  keyframeTimer: NodeJS.Timeout | null;
};

const activeSessions: Map<string, RecordingSession> = new Map();

const DEFAULT_RTP_BASE_PORT = 20000;
const rtpBasePort = Number(process.env.RECORDING_RTP_BASE_PORT) || DEFAULT_RTP_BASE_PORT;
let nextPort = rtpBasePort;
const usedPorts: Set<number> = new Set();

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function allocatePortPair(): { rtpPort: number; rtcpPort: number } {
  // PlainTransport uses RTP and RTCP ports (when rtcpMux=false)
  let rtpPort = nextPort;
  while (usedPorts.has(rtpPort) || usedPorts.has(rtpPort + 1)) {
    rtpPort += 2;
  }

  const rtcpPort = rtpPort + 1;
  usedPorts.add(rtpPort);
  usedPorts.add(rtcpPort);
  nextPort = rtcpPort + 2;

  return { rtpPort, rtcpPort };
}

function releasePorts(ports: number[]) {
  for (const p of ports) usedPorts.delete(p);
}

function getLocalIp() {
  // For server-side recording we generally want loopback for FFmpeg.
  return process.env.RECORDING_ANNOUNCED_IP || "127.0.0.1";
}

function buildSdpForConsumer(params: {
  kind: types.MediaKind;
  sdpIp: string;
  rtpPort: number;
  consumer: types.Consumer;
}) {
  const { kind, sdpIp, rtpPort, consumer } = params;
  const { rtpParameters } = consumer;

  // Usually there is exactly one codec in rtpParameters.codecs.
  const codec = rtpParameters.codecs[0];
  const payloadType = codec.payloadType;

  const codecMimeSubtype = codec.mimeType.split("/")[1] || codec.mimeType;
  const clockRate = codec.clockRate;

  const channels = kind === "audio" ? (codec as any).channels || 2 : undefined;

  const rtpmap = kind === "audio"
    ? `a=rtpmap:${payloadType} ${codecMimeSubtype}/${clockRate}/${channels}`
    : `a=rtpmap:${payloadType} ${codecMimeSubtype}/${clockRate}`;

  const fmtpEntries = codec.parameters ? Object.entries(codec.parameters) : [];
  const fmtpLine =
    fmtpEntries.length > 0
      ? `a=fmtp:${payloadType} ${fmtpEntries
          .map(([k, v]) => `${k}=${v}`)
          .join(";")}`
      : "";

  const media = kind === "audio" ? "audio" : "video";
  const sdp =
    [
      "v=0",
      `o=- 0 0 IN IP4 ${sdpIp}`,
      "s=Recording",
      `c=IN IP4 ${sdpIp}`,
      "t=0 0",
      `m=${media} ${rtpPort} RTP/AVP ${payloadType}`,
      rtpmap,
      fmtpLine,
    ]
      .filter(Boolean)
      .join("\n");

  return sdp;
}

/**
 * Build an FFmpeg filter_complex snippet that arranges multiple video inputs
 * into a grid layout (1=full, 2=side-by-side, 3-4=2x2, 5-6=3x2, etc.).
 * Each cell is scaled to equal size; empty cells are filled with black.
 */
function buildVideoGridFilter(params: {
  videoInputIndices: number[];
  targetWidth: number;
  targetHeight: number;
}): { filterParts: string[]; videoOutputLabel: string } {
  const { videoInputIndices, targetWidth, targetHeight } = params;
  const n = videoInputIndices.length;

  if (n === 0) return { filterParts: [], videoOutputLabel: "" };

  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  // Make cell dimensions even (required by most codecs)
  const cellW = Math.floor(targetWidth / cols) & ~1;
  const cellH = Math.floor(targetHeight / rows) & ~1;

  const filterParts: string[] = [];
  const stackInputLabels: string[] = [];

  // Scale each video input to the cell size (with padding to maintain aspect ratio)
  for (let i = 0; i < n; i++) {
    const idx = videoInputIndices[i];
    const label = `sv${i}`;
    filterParts.push(
      `[${idx}:v]scale=${cellW}:${cellH}:force_original_aspect_ratio=decrease,` +
      `pad=${cellW}:${cellH}:(ow-iw)/2:(oh-ih)/2:color=black,setpts=PTS-STARTPTS[${label}]`
    );
    stackInputLabels.push(`[${label}]`);
  }

  // Single video — no stacking needed
  if (n === 1) {
    return { filterParts, videoOutputLabel: "sv0" };
  }

  // Pad empty grid cells with black
  const totalCells = cols * rows;
  for (let i = n; i < totalCells; i++) {
    const label = `blk${i}`;
    filterParts.push(`color=black:s=${cellW}x${cellH}:r=1[${label}]`);
    stackInputLabels.push(`[${label}]`);
  }

  // Build xstack layout string: "x0_y0|x1_y1|..."
  const layoutParts: string[] = [];
  for (let i = 0; i < totalCells; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    layoutParts.push(`${col * cellW}_${row * cellH}`);
  }

  filterParts.push(
    `${stackInputLabels.join("")}xstack=inputs=${totalCells}:layout=${layoutParts.join("|")}[vout]`
  );

  return { filterParts, videoOutputLabel: "vout" };
}

function buildFfmpegArgs(params: {
  outputPath: string;
  videoInputIndices: number[];
  audioInputIndices: number[];
  sdpPathsInOrder: string[];
  targetWidth: number;
  targetHeight: number;
}) {
  const {
    outputPath,
    videoInputIndices,
    audioInputIndices,
    sdpPathsInOrder,
    targetWidth,
    targetHeight,
  } = params;

  const args: string[] = [
    "-fflags",
    "+genpts+discardcorrupt",
    "-analyzeduration",
    "10000000",
    "-probesize",
    "10000000",
  ];

  for (const sdpPath of sdpPathsInOrder) {
    // thread_queue_size: buffer packets per input to prevent drops during compositing.
    // max_delay: allow buffering before forcing packet consumption.
    args.push(
      "-thread_queue_size", "4096",
      "-max_delay", "10000000",
      "-protocol_whitelist", "file,udp,rtp,rtcp",
      "-i", sdpPath,
    );
  }

  // --- Build filter_complex ---
  const filterParts: string[] = [];

  // Video grid
  const hasVideo = videoInputIndices.length > 0;
  let videoOutputLabel = "";
  if (hasVideo) {
    const grid = buildVideoGridFilter({ videoInputIndices, targetWidth, targetHeight });
    filterParts.push(...grid.filterParts);
    videoOutputLabel = grid.videoOutputLabel;
  }

  // Audio mix
  const audioLabels = audioInputIndices.map((i) => `[${i}:a]`).join("");
  filterParts.push(
    `${audioLabels}amix=inputs=${audioInputIndices.length}:duration=longest[aout]`
  );

  args.push("-filter_complex", filterParts.join(";"));

  // --- Mapping & codecs: VP8 + Opus in WebM ---
  // VP8/WebM handles RTP timestamp synchronization much better than H.264/MP4
  // for live capture. The processor will remux to H.264 MP4 afterwards (fast copy-like step).
  if (hasVideo) {
    args.push(
      "-map", `[${videoOutputLabel}]`,
      "-map", "[aout]",
      "-c:v", "libvpx",
      "-b:v", "500k",            // lower bitrate for 640x360
      "-quality", "realtime",
      "-deadline", "realtime",
      "-cpu-used", "8",          // max speed, lowest CPU usage
      "-lag-in-frames", "0",     // no look-ahead buffering
      "-error-resilient", "1",   // handle dropped packets gracefully
      "-auto-alt-ref", "0",      // disable alt reference frames (faster)
      "-static-thresh", "1000",  // skip encoding similar frames (huge CPU saving)
      "-c:a", "libopus",
      "-b:a", "96k",
    );
  } else {
    args.push(
      "-map", "[aout]",
      "-c:a", "libopus",
      "-b:a", "128k",
    );
  }

  args.push("-f", "webm", "-y", outputPath);
  return args;
}

export function isRecordingActive(recordingId: string) {
  return activeSessions.has(recordingId);
}

export async function startServerRecording(params: {
  roomId: string;
  recordingId: string;
  isAudioOnly: boolean;
}): Promise<{ outputPath: string }> {
  const { roomId, recordingId, isAudioOnly } = params;

  console.log("[recording:server] startServerRecording called", { roomId, recordingId, isAudioOnly });

  if (activeSessions.has(recordingId)) {
    throw new Error(`Recording session already active for recordingId=${recordingId}`);
  }

  ensureDir(recordingConfig.tempUploadDir);

  const sessionBaseDir = path.join(recordingConfig.tempUploadDir, recordingId);
  const sdpDir = path.join(sessionBaseDir, "sdp");
  ensureDir(sessionBaseDir);
  ensureDir(sdpDir);

  const outputPath = path.join(sessionBaseDir, "raw.webm");

  // Clean existing output to avoid ffmpeg appending/reading stale files.
  if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

  const room = await getOrCreateRoom(roomId);
  const producers = getRoomProducers(roomId);

  console.log("[recording:server] all producers in room", {
    recordingId,
    roomId,
    totalProducers: producers.length,
    producers: producers.map((p) => ({
      producerId: p.producerId,
      userId: p.userId,
      kind: p.kind,
    })),
  });

  const audioProducers = producers.filter((p) => p.kind === "audio");
  const videoProducers = producers.filter((p) => p.kind === "video");

  // Capture ALL video producers (one per participant) for grid layout
  const selectedVideoProducers = !isAudioOnly ? videoProducers : [];
  const selectedAudioProducers = audioProducers;

  if (selectedAudioProducers.length === 0 && selectedVideoProducers.length === 0) {
    throw new Error("No audio/video producers found for server-side recording.");
  }

  const sdpIp = getLocalIp();

  const streams: ServerStream[] = [];

  // Consume each selected producer and send its RTP to a dedicated localhost port for FFmpeg.
  // Video producers first, then audio — so FFmpeg input indices are predictable.
  const selectedStreams: { producerId: string; kind: types.MediaKind }[] = [
    ...selectedVideoProducers.map((p) => ({ producerId: p.producerId, kind: "video" as const })),
    ...selectedAudioProducers.map((p) => ({ producerId: p.producerId, kind: "audio" as const })),
  ];

  for (let i = 0; i < selectedStreams.length; i++) {
    const s = selectedStreams[i];
    const { rtpPort, rtcpPort } = allocatePortPair();

    const transport = await room.router.createPlainTransport({
      listenIp: sdpIp,
      rtcpMux: false,
      comedia: false,
    });

    await transport.connect({ ip: sdpIp, port: rtpPort, rtcpPort });

    const consumer = await transport.consume({
      producerId: s.producerId,
      rtpCapabilities: room.router.rtpCapabilities,
      // Start paused so we can bring FFmpeg up first, then resume and request keyframes.
      paused: true,
    });

    const sdpPath = path.join(sdpDir, `stream-${i}.sdp`);
    const sdp = buildSdpForConsumer({ kind: s.kind, sdpIp, rtpPort, consumer });
    await fsp.writeFile(sdpPath, sdp, "utf8");

    streams.push({
      producerId: s.producerId,
      kind: s.kind,
      transport,
      consumer,
      rtpPort,
      rtcpPort,
      sdpPath,
    });
  }

  // Separate video and audio input indices (video first, then audio — matches selectedStreams order)
  const sdpPathsInOrder = streams.map((st) => st.sdpPath);
  const videoInputIndices: number[] = [];
  const audioInputIndices: number[] = [];
  for (let i = 0; i < streams.length; i++) {
    if (streams[i].kind === "video") videoInputIndices.push(i);
    else audioInputIndices.push(i);
  }

  if (audioInputIndices.length === 0) {
    throw new Error("Server-side recording currently requires at least one audio producer.");
  }

  console.log("[recording:server] grid layout", {
    recordingId,
    videoStreams: videoInputIndices.length,
    audioStreams: audioInputIndices.length,
  });

  // Use low resolution for live capture to minimize CPU usage and RTP packet drops.
  // Phase 2 (HLS transcode) produces high quality from this source.
  const args = buildFfmpegArgs({
    outputPath,
    videoInputIndices,
    audioInputIndices,
    sdpPathsInOrder,
    targetWidth: 640,
    targetHeight: 360,
  });

  const ffmpegStderrPrefix = `[recording:${recordingId}] ffmpeg`;
  console.log("[recording:server] spawn ffmpeg", {
    recordingId,
    roomId,
    outputPath,
    streams: streams.map((s) => ({ kind: s.kind, producerId: s.producerId, rtpPort: s.rtpPort })),
  });

  const ffmpegProcess = spawn(ffmpegBinary, args, { stdio: ["pipe", "pipe", "pipe"] });

  ffmpegProcess.stdout.on("data", () => {
    // ignore stdout; most useful logs go to stderr
  });
  ffmpegProcess.stderr.on("data", (chunk) => {
    console.log(`${ffmpegStderrPrefix} ${chunk.toString().trim()}`);
  });

  // Resume consumers after FFmpeg has been spawned and request keyframes for video.
  // This reduces "unspecified size / keyframe missing" startup failures.
  for (const st of streams) {
    try {
      await st.consumer.resume();
    } catch {
      // ignore
    }
    if (st.kind === "video") {
      try {
        await (st.consumer as any).requestKeyFrame?.();
      } catch {
        // ignore
      }
    }
  }

  const keyframeTimer = setInterval(() => {
    for (const st of streams) {
      if (st.kind !== "video") continue;
      try {
        if (!st.consumer.closed) {
          (st.consumer as any).requestKeyFrame?.()?.catch?.(() => {});
        }
      } catch {
        // ignore
      }
    }
  }, 2000);

  const allocatedPorts = streams.flatMap((st) => [st.rtpPort, st.rtcpPort]);

  const session: RecordingSession = {
    roomId,
    recordingId,
    outputPath,
    sdpDir,
    ffmpegProcess,
    ffmpegStderrPrefix,
    streams,
    allocatedPorts,
    keyframeTimer,
  };

  activeSessions.set(recordingId, session);

  return { outputPath };
}

export async function stopServerRecording(recordingId: string): Promise<{ outputPath: string }> {
  const session = activeSessions.get(recordingId);
  if (!session) {
    throw new Error(`No active server-side recording session for recordingId=${recordingId}`);
  }

  activeSessions.delete(recordingId);

  const { ffmpegProcess, streams, outputPath, allocatedPorts, keyframeTimer } = session;

  // Stop keyframe timer first, then wait for any in-flight requestKeyFrame()
  // promises to settle before closing consumers. Without this delay, the mediasoup
  // Channel rejects the pending request after the consumer is gone → unhandled rejection crash.
  if (keyframeTimer) {
    clearInterval(keyframeTimer);
  }
  // Wait for in-flight keyframe requests to resolve/reject (mediasoup round-trip < 500ms)
  await new Promise((r) => setTimeout(r, 500));

  // Close mediasoup consumers so FFmpeg stops receiving data.
  for (const st of streams) {
    try { st.consumer.close(); } catch { /* ignore */ }
    try { st.transport.close(); } catch { /* ignore */ }
  }

  // Send quit command to FFmpeg stdin.
  try {
    ffmpegProcess.stdin?.write("q\n");
  } catch {
    // ignore
  }
  try {
    ffmpegProcess.stdin?.end();
  } catch {
    // ignore
  }

  const exitCode: number | null = await new Promise((resolve) => {
    let resolved = false;
    const onClose = (code: number | null) => {
      if (resolved) return;
      resolved = true;
      resolve(code);
    };
    ffmpegProcess.once("close", onClose);
    // SIGTERM after 10s, SIGKILL after 15s — no need to wait 45s
    setTimeout(() => {
      try { ffmpegProcess.kill("SIGTERM"); } catch { /* ignore */ }
      setTimeout(() => {
        try { ffmpegProcess.kill("SIGKILL"); } catch { /* ignore */ }
        onClose(null);
      }, 5000);
    }, 10000);
  });

  console.log("[recording:server] ffmpeg stopped", { recordingId, exitCode });

  releasePorts(allocatedPorts);

  return { outputPath };
}

