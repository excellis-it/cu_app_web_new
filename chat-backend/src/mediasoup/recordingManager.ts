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
  width?: number;
  height?: number;
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
  videoDimensions?: Map<number, { width: number; height: number }>;
}): { filterParts: string[]; videoOutputLabel: string } {
  const { videoInputIndices, targetWidth, targetHeight, videoDimensions } = params;
  const n = videoInputIndices.length;

  if (n === 0) return { filterParts: [], videoOutputLabel: "" };

  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  // Make cell dimensions even (required by most codecs)
  const cellW = Math.floor(targetWidth / cols) & ~1;
  const cellH = Math.floor(targetHeight / rows) & ~1;

  const filterParts: string[] = [];
  const stackInputLabels: string[] = [];

  // Scale each video input to the cell size, handle portrait rotation, and pad to exact cell size.
  for (let i = 0; i < n; i++) {
    const idx = videoInputIndices[i];
    const label = `sv${i}`;

    // Check if the frontend reported portrait dimensions (height > width).
    // videoDimensions is keyed by the original stream index (before +1 shift for lavfi background).
    const dims = videoDimensions?.get(idx - 1);
    const isPortrait = dims ? dims.height > dims.width : false;

    // Build per-input filter chain:
    // 1. fps=15 (normalize frame rate)
    // 2. transpose=1:passthrough=portrait (only for portrait streams — rotates landscape pixels
    //    to portrait, but leaves already-portrait pixels untouched)
    // 3. scale to fit cell while preserving aspect ratio
    // 4. pad to exact cell size (center video, fill remainder with black — required by xstack)
    const chain: string[] = [`[${idx}:v]fps=15`];

    if (isPortrait) {
      chain.push("transpose=1:passthrough=portrait");
    }

    chain.push(
      `scale=${cellW}:${cellH}:force_original_aspect_ratio=decrease:flags=fast_bilinear`,
      `pad=${cellW}:${cellH}:(ow-iw)/2:(oh-ih)/2:color=black`,
    );

    filterParts.push(`${chain.join(",")}[${label}]`);
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
  videoDimensions?: Map<number, { width: number; height: number }>;
}) {
  const {
    outputPath,
    videoInputIndices: originalVideoIndices,
    audioInputIndices: originalAudioIndices,
    sdpPathsInOrder,
    targetWidth,
    targetHeight,
  } = params;

  // We added a 'lavfi' background as input 0.
  // Shift all original indices up by 1.
  const videoInputIndices = originalVideoIndices.map(i => i + 1);
  const audioInputIndices = originalAudioIndices.map(i => i + 1);

  const args: string[] = [
    "-fflags",
    "+genpts+discardcorrupt+nobuffer",
    "-analyzeduration",
    "2000000",
    "-probesize",
    "2000000",
    // Base black background starting at t=0
    "-f", "lavfi", "-i", `color=c=black:s=${targetWidth}x${targetHeight}:r=15`,
  ];

  for (const sdpPath of sdpPathsInOrder) {
    // thread_queue_size: buffer packets per input to prevent drops during compositing.
    // max_delay: keep low (0.5s) to prevent FFmpeg from blocking on one input and starving others.
    // reorder_queue_size=0: localhost RTP doesn't need packet reordering — skip it.
    // buffer_size=2097152: increase UDP socket receive buffer to 2MB to survive bursts while FFmpeg reads other inputs.
    // use_wallclock_as_timestamps: force absolute sync across all A/V inputs based on arrival time.
    args.push(
      "-thread_queue_size", "8192",
      "-analyzeduration", "500000",   // per-input: 0.5s probe (SDP declares codec, no need to wait)
      "-probesize", "500000",
      "-max_delay", "500000",
      "-reorder_queue_size", "0",
      "-buffer_size", "2097152",
      "-use_wallclock_as_timestamps", "1",
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
    const grid = buildVideoGridFilter({ videoInputIndices, targetWidth, targetHeight, videoDimensions: params.videoDimensions });
    filterParts.push(...grid.filterParts);
    videoOutputLabel = grid.videoOutputLabel;
  }

  // Audio mix
  const audioLabels = audioInputIndices.map((i) => `[${i}:a]`).join("");
  filterParts.push(
    `${audioLabels}amix=inputs=${audioInputIndices.length}:duration=longest[aout]`
  );

  // Overlay the grid on top of the persistent black background (input index 0)
  if (hasVideo) {
    filterParts.push(`[0:v][${videoOutputLabel}]overlay=shortest=0[vout_final]`);
  }

  args.push("-filter_complex", filterParts.join(";"));

  // --- Mapping & codecs: VP8 + Opus in WebM ---
  // VP8/WebM handles RTP timestamp synchronization much better than H.264/MP4
  // for live capture. The processor will remux to H.264 MP4 afterwards (fast copy-like step).
  if (hasVideo) {
    args.push(
      "-map", "[vout_final]",
      "-map", "[aout]",
      "-c:v", "libvpx",
      "-b:v", "2500k",            // target bitrate for VBR
      "-crf", "20",               // good visual quality (lower = better, 10-20 is ideal range)
      "-quality", "realtime",
      "-deadline", "realtime",
      "-cpu-used", "8",           // balanced speed/quality (valid 0-16, quality degrades above 8)
      "-threads", "0",            // use all available cores for encoding
      "-lag-in-frames", "0",      // no look-ahead buffering (required for realtime)
      "-error-resilient", "1",    // handle dropped packets gracefully
      "-auto-alt-ref", "0",       // disable alt reference frames (required for realtime)
      "-static-thresh", "100",    // mild skip threshold — avoids major artifacts on slow motion
      "-c:a", "libopus",
      "-b:a", "128k",
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
      width: p.width,
      height: p.height,
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
  const selectedStreams: { producerId: string; kind: types.MediaKind; width?: number; height?: number }[] = [
    ...selectedVideoProducers.map((p) => ({ producerId: p.producerId, kind: "video" as const, width: p.width, height: p.height })),
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
    // For simulcast/SVC producers, lock recording to the lowest layer.
    // This significantly reduces RTP pressure and packet loss during server-side compositing.
    if (s.kind === "video") {
      try {
        await (consumer as any).setPreferredLayers?.({ spatialLayer: 0, temporalLayer: 0 });
      } catch {
        // ignore if not supported by this consumer/codec
      }
    }

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
      width: s.width,
      height: s.height,
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

  // Build video dimensions map for portrait detection in the FFmpeg filter.
  const videoDimensions = new Map<number, { width: number; height: number }>();
  for (let i = 0; i < streams.length; i++) {
    if (streams[i].kind === "video" && streams[i].width && streams[i].height) {
      videoDimensions.set(i, { width: streams[i].width!, height: streams[i].height! });
    }
  }

  // Use low resolution for live capture to minimize CPU usage and RTP packet drops.
  // Phase 2 (HLS transcode) produces high quality from this source.
  const args = buildFfmpegArgs({
    outputPath,
    videoInputIndices,
    audioInputIndices,
    sdpPathsInOrder,
    targetWidth: 1280,
    targetHeight: 720,
    videoDimensions,
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

  // Wait for FFmpeg to open all SDP inputs before resuming consumers.
  // Each input takes ~0.5s to probe (analyzeduration), so total startup ≈ N × 0.5s.
  // Resuming too early wastes keyframes that arrive before FFmpeg is listening.
  const ffmpegStartupMs = streams.length * 600; // 0.6s per input with margin
  await new Promise((r) => setTimeout(r, ffmpegStartupMs));

  // Resume consumers and request keyframes AFTER FFmpeg is ready to receive.
  for (const st of streams) {
    try {
      await st.consumer.resume();
    } catch {
      // ignore
    }
  }

  // Request keyframes for video — burst to ensure FFmpeg gets one quickly.
  for (const st of streams) {
    if (st.kind !== "video") continue;
    try {
      await (st.consumer as any).requestKeyFrame?.();
      setTimeout(() => (st.consumer as any).requestKeyFrame?.().catch(() => {}), 500);
      setTimeout(() => (st.consumer as any).requestKeyFrame?.().catch(() => {}), 1500);
      setTimeout(() => (st.consumer as any).requestKeyFrame?.().catch(() => {}), 3000);
    } catch {
      // ignore
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
  }, 5000);

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

  // 1. Send quit command to FFmpeg stdin to flush buffers properly.
  // We close the consumers later (after FFmpeg exits).

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

  // 3. Close mediasoup consumers ONLY AFTER FFmpeg has finished writing files.
  for (const st of streams) {
    try { st.consumer.close(); } catch { /* ignore */ }
    try { st.transport.close(); } catch { /* ignore */ }
  }

  releasePorts(allocatedPorts);

  return { outputPath };
}

