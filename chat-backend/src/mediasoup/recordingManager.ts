import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { types } from "mediasoup";

import { getOrCreateRoom, getRoomProducers } from "./mediaRoomManager";
import { recordingConfig } from "../helpers/recordingConfig";
import CallRecording from "../db/schemas/callrecording.schema";
import ScreenRecording from "../db/schemas/screen-recording.schema";

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
  ffmpegExited: boolean;
  ffmpegExitCode: number | null;
  commonStartMicros: number;
  segments: string[];
};

const activeSessions: Map<string, RecordingSession> = new Map();

const DEFAULT_RTP_BASE_PORT = 20000;
const DEFAULT_RTP_MAX_PORT = 30000;
const rtpBasePort = Number(process.env.RECORDING_RTP_BASE_PORT) || DEFAULT_RTP_BASE_PORT;
const rtpMaxPort = Number(process.env.RECORDING_RTP_MAX_PORT) || DEFAULT_RTP_MAX_PORT;
let nextPort = rtpBasePort;
const usedPorts: Set<number> = new Set();

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function allocatePortPair(): { rtpPort: number; rtcpPort: number } {
  // PlainTransport uses RTP and RTCP ports (when rtcpMux=false)
  let rtpPort = nextPort;
  let scanned = 0;
  const totalRange = rtpMaxPort - rtpBasePort;

  while (usedPorts.has(rtpPort) || usedPorts.has(rtpPort + 1)) {
    rtpPort += 2;
    if (rtpPort >= rtpMaxPort) rtpPort = rtpBasePort; // wraparound
    scanned += 2;
    if (scanned >= totalRange) {
      throw new Error("RTP port pool exhausted — no free port pairs available.");
    }
  }

  const rtcpPort = rtpPort + 1;
  usedPorts.add(rtpPort);
  usedPorts.add(rtcpPort);
  nextPort = rtcpPort + 1 >= rtpMaxPort ? rtpBasePort : rtcpPort + 1;

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
  commonStartMicros: number;
}): { filterParts: string[]; videoOutputLabel: string } {
  const { videoInputIndices, targetWidth, targetHeight, videoDimensions, commonStartMicros } = params;
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
    // We use a shared wallclock offset (commonStartMicros) instead of STARTPTS
    // so all participants stay in sync relative to each other on the recording timeline.
    const chain: string[] = [`[${idx}:v]setpts=PTS-${params.commonStartMicros},fps=15`];

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
  commonStartMicros: number;
}) {
  const {
    outputPath,
    videoInputIndices: originalVideoIndices,
    audioInputIndices: originalAudioIndices,
    sdpPathsInOrder,
    targetWidth,
    targetHeight,
    commonStartMicros,
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
    // max_delay: allow up to 5s so FFmpeg doesn't discard packets during transient encoding spikes.
    // reorder_queue_size: allow modest reordering — even localhost UDP can arrive out-of-order under load.
    // buffer_size: 8MB UDP receive buffer to absorb bursts while FFmpeg is busy encoding other frames.
    // rw_timeout=5000000: give up reading from a dead UDP socket after 5s (prevents infinite block if a stream dies mid-recording).
    // use_wallclock_as_timestamps: force absolute sync across all A/V inputs based on arrival time.
    args.push(
      "-thread_queue_size", "4096",
      "-analyzeduration", "500000",   // per-input: 0.5s probe (SDP declares codec, no need to wait)
      "-probesize", "500000",
      "-max_delay", "5000000",
      "-reorder_queue_size", "128",
      "-buffer_size", "8388608",
      "-rw_timeout", "5000000",
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
    const grid = buildVideoGridFilter({
      videoInputIndices,
      targetWidth,
      targetHeight,
      videoDimensions: params.videoDimensions,
      commonStartMicros,
    });
    filterParts.push(...grid.filterParts);
    videoOutputLabel = grid.videoOutputLabel;
  }

  // Audio mix: normalize each audio input's timestamps to a shared wallclock offset.
  // Without this, wall-clock timestamp differences between inputs cause A/V drift.
  for (let i = 0; i < audioInputIndices.length; i++) {
    const idx = audioInputIndices[i];
    filterParts.push(`[${idx}:a]asetpts=PTS-${commonStartMicros}[anorm${i}]`);
  }
  const normalizedAudioLabels = audioInputIndices.map((_, i) => `[anorm${i}]`).join("");
  filterParts.push(
    `${normalizedAudioLabels}amix=inputs=${audioInputIndices.length}:duration=longest,aresample=async=1000[aout]`
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
      "-b:v", "1200k",            // target bitrate for VBR (640x480 doesn't need more)
      "-crf", "25",               // balanced quality for live capture (post-processor improves it)
      "-quality", "realtime",
      "-deadline", "realtime",
      "-cpu-used", "12",          // prioritize encoding speed over quality to prevent packet drops
      "-threads", "0",            // use all available cores for encoding
      "-lag-in-frames", "0",      // no look-ahead buffering (required for realtime)
      "-error-resilient", "1",    // handle dropped packets gracefully
      "-auto-alt-ref", "0",       // disable alt reference frames (required for realtime)
      "-static-thresh", "500",    // skip encoding visually static frames — reduces CPU spikes
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

/**
 * Recover stale recording records on server startup.
 * Any recording/screen-recording stuck in "recording" or "processing" state
 * that is NOT backed by a live in-memory session is orphaned from a previous
 * server run and should be marked "failed".
 */
export async function recoverStaleRecordings() {
  const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS);

  try {
    const staleCallRecordings = await CallRecording.updateMany(
      {
        status: { $in: ["recording", "processing"] },
        updatedAt: { $lt: cutoff },
      },
      { $set: { status: "failed", errorMessage: "Server restarted — recording session was orphaned." } },
    );

    const staleScreenRecordings = await ScreenRecording.updateMany(
      {
        status: { $in: ["recording", "processing"] },
        updatedAt: { $lt: cutoff },
      },
      { $set: { status: "failed", errorMessage: "Server restarted — recording session was orphaned." } },
    );

    const totalRecovered =
      (staleCallRecordings.modifiedCount || 0) + (staleScreenRecordings.modifiedCount || 0);

    if (totalRecovered > 0) {
      console.log("[recording:recovery] marked stale recordings as failed on startup", {
        callRecordings: staleCallRecordings.modifiedCount || 0,
        screenRecordings: staleScreenRecordings.modifiedCount || 0,
      });
    }
  } catch (err: any) {
    console.error("[recording:recovery] startup recovery failed (non-fatal)", {
      error: err?.message || String(err),
    });
  }
}

/**
 * Find an active recording session for the given room, if any.
 * Returns the recordingId or null.
 */
export function getActiveRecordingForRoom(roomId: string): string | null {
  for (const [recordingId, session] of activeSessions.entries()) {
    if (session.roomId === roomId) return recordingId;
  }
  return null;
}

/**
 * Restart a running recording to pick up new producers (e.g., late-joining participants).
 * Stops the current FFmpeg, releases resources, and starts a fresh session with all current producers.
 * The old raw segment is discarded (it will be part of the seamless new recording).
 */
export async function restartServerRecording(params: {
  roomId: string;
  recordingId: string;
  isAudioOnly: boolean;
}): Promise<void> {
  const { roomId, recordingId } = params;
  const session = activeSessions.get(recordingId);
  if (!session) return;

  console.log("[recording:server] restarting to pick up new producers", { roomId, recordingId });

  // Capture existing session data to preserve timeline and segments
  const { ffmpegProcess, streams, allocatedPorts, keyframeTimer, commonStartMicros, segments } = session;

  if (keyframeTimer) clearInterval(keyframeTimer);
  await new Promise((r) => setTimeout(r, 300));

  try { ffmpegProcess.kill("SIGKILL"); } catch { /* ignore */ }
  await new Promise((resolve) => {
    ffmpegProcess.once("close", resolve);
    setTimeout(resolve, 3000); // don't wait forever
  });

  for (const st of streams) {
    try { st.consumer.close(); } catch { /* ignore */ }
    try { st.transport.close(); } catch { /* ignore */ }
  }
  releasePorts(allocatedPorts);

  // Restart exactly where we left off, passing the existing segments and start time.
  await startServerRecording({
    ...params,
    existingSegments: segments,
    sharedStartMicros: commonStartMicros,
  });
  console.log("[recording:server] restart complete", { roomId, recordingId });
}

export async function startServerRecording(params: {
  roomId: string;
  recordingId: string;
  isAudioOnly: boolean;
  existingSegments?: string[];
  sharedStartMicros?: number;
}): Promise<{ outputPath: string }> {
  const { roomId, recordingId, isAudioOnly, existingSegments = [], sharedStartMicros } = params;

  console.log("[recording:server] startServerRecording called", { roomId, recordingId, isAudioOnly });

  if (activeSessions.has(recordingId)) {
    throw new Error(`Recording session already active for recordingId=${recordingId}`);
  }

  ensureDir(recordingConfig.tempUploadDir);

  const sessionBaseDir = path.join(recordingConfig.tempUploadDir, recordingId);
  const sdpDir = path.join(sessionBaseDir, "sdp");
  ensureDir(sessionBaseDir);
  ensureDir(sdpDir);

  // If this is a restart/continuation, we use a new segment file.
  // The stopServerRecording function will merge them all at the end.
  const segmentIndex = existingSegments.length;
  const outputPath = path.join(sessionBaseDir, `raw_${segmentIndex}.webm`);

  // Clean existing segment specifically (unlikely to exist but good practice)
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

  // Brief pause to let any in-flight disconnection events (DTLS close, producer close)
  // propagate through mediasoup before we commit to the FFmpeg input list.
  // Reduced to 400ms to improve responsiveness.
  await new Promise((r) => setTimeout(r, 400));

  // Filter out consumers that closed during the wait (producer's transport died).
  const deadStreams = streams.filter((st) => st.consumer.closed);
  if (deadStreams.length > 0) {
    console.log("[recording:server] pruning dead streams before FFmpeg", {
      recordingId,
      dead: deadStreams.map((s) => ({ producerId: s.producerId, kind: s.kind })),
    });
    for (const st of deadStreams) {
      try { st.consumer.close(); } catch { /* already closed */ }
      try { st.transport.close(); } catch { /* ignore */ }
    }
    const deadPorts = deadStreams.flatMap((st) => [st.rtpPort, st.rtcpPort]);
    releasePorts(deadPorts);
  }
  const liveStreams = streams.filter((st) => !st.consumer.closed);

  if (liveStreams.length === 0) {
    throw new Error("All consumers closed before FFmpeg could start — no streams to record.");
  }
  if (!liveStreams.some((st) => st.kind === "audio")) {
    throw new Error("No live audio consumers remain — server-side recording requires at least one audio stream.");
  }

  // Rebuild indices from liveStreams only
  const sdpPathsInOrder = liveStreams.map((st) => st.sdpPath);
  const videoInputIndices: number[] = [];
  const audioInputIndices: number[] = [];
  for (let i = 0; i < liveStreams.length; i++) {
    if (liveStreams[i].kind === "video") videoInputIndices.push(i);
    else audioInputIndices.push(i);
  }

  console.log("[recording:server] grid layout", {
    recordingId,
    videoStreams: videoInputIndices.length,
    audioStreams: audioInputIndices.length,
  });

  // Build video dimensions map for portrait detection in the FFmpeg filter.
  const videoDimensions = new Map<number, { width: number; height: number }>();
  for (let i = 0; i < liveStreams.length; i++) {
    if (liveStreams[i].kind === "video" && liveStreams[i].width && liveStreams[i].height) {
      videoDimensions.set(i, { width: liveStreams[i].width!, height: liveStreams[i].height! });
    }
  }

  const commonStartMicros = sharedStartMicros || Date.now() * 1000;

  // Use low resolution for live capture to minimize CPU usage and RTP packet drops.
  const args = buildFfmpegArgs({
    outputPath,
    videoInputIndices,
    audioInputIndices,
    sdpPathsInOrder,
    targetWidth: 640,
    targetHeight: 480,
    videoDimensions,
    commonStartMicros,
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
  // We use a fixed short delay now instead of per-stream linear wait.
  await new Promise((r) => setTimeout(r, 400));

  // Resume consumers and request keyframes AFTER FFmpeg is ready to receive.
  const resumePromises = liveStreams.map(async (st) => {
    try {
      await st.consumer.resume();
      if (st.kind === "video" && !st.consumer.closed) {
        // Initial keyframe request burst
        await (st.consumer as any).requestKeyFrame?.();
        setTimeout(() => { if (!st.consumer.closed) (st.consumer as any).requestKeyFrame?.()?.catch?.(() => { }); }, 500);
        setTimeout(() => { if (!st.consumer.closed) (st.consumer as any).requestKeyFrame?.()?.catch?.(() => { }); }, 1500);
      }
    } catch { /* ignore */ }
  });

  await Promise.all(resumePromises);

  const keyframeTimer = setInterval(() => {
    for (const st of liveStreams) {
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

  const allocatedPorts = liveStreams.flatMap((st) => [st.rtpPort, st.rtcpPort]);

  const session: RecordingSession = {
    roomId,
    recordingId,
    outputPath,
    sdpDir,
    ffmpegProcess,
    ffmpegStderrPrefix,
    streams: liveStreams,
    allocatedPorts,
    keyframeTimer,
    ffmpegExited: false,
    ffmpegExitCode: null,
    commonStartMicros,
    segments: [...existingSegments, outputPath],
  };

  activeSessions.set(recordingId, session);

  // Track early FFmpeg death (e.g. all inputs died mid-recording).
  // This lets stopServerRecording skip waiting on an already-dead process.
  ffmpegProcess.once("close", (code) => {
    if (activeSessions.has(recordingId)) {
      const s = activeSessions.get(recordingId)!;
      s.ffmpegExited = true;
      s.ffmpegExitCode = code;
      console.log("[recording:server] ffmpeg exited early", { recordingId, exitCode: code });
    }
  });

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

  // If FFmpeg already exited (e.g. all inputs died mid-recording), skip the stop dance.
  let exitCode: number | null = session.ffmpegExitCode;

  if (session.ffmpegExited) {
    console.log("[recording:server] ffmpeg already exited before stop was called", {
      recordingId,
      exitCode,
    });
  } else {
    // Send quit command to FFmpeg stdin to flush buffers properly.
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

    exitCode = await new Promise((resolve) => {
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
  }

  releasePorts(allocatedPorts);

  // 4. Merge segments if there are multiple parts (due to late joiners/restarts)
  if (session.segments.length > 1) {
    const finalOutputPath = path.join(path.dirname(outputPath), "raw.webm");
    const concatListPath = path.join(path.dirname(outputPath), "concat-list-server.txt");

    console.log("[recording:server] merging segments", { segments: session.segments.length, finalOutputPath });

    const concatContent = session.segments
      .map(s => `file '${path.resolve(s).replaceAll("\\", "/")}'`)
      .join("\n");

    await fsp.writeFile(concatListPath, concatContent, "utf8");

    try {
      const ffmpeg = spawn(ffmpegBinary, [
        "-y", "-f", "concat", "-safe", "0", "-i", concatListPath, "-c", "copy", finalOutputPath,
      ]);
      await new Promise((resolve, reject) => {
        ffmpeg.on("close", (code) => code === 0 ? resolve(null) : reject(new Error(`Merge failed with code ${code}`)));
      });
      return { outputPath: finalOutputPath };
    } catch (err) {
      console.error("[recording:server] segment merge failed, falling back to last segment", err);
      return { outputPath };
    }
  }

  // If only one segment, rename it to the standard raw.webm so the processor finds it easily.
  const finalOutputPath = path.join(path.dirname(outputPath), "raw.webm");
  if (fs.existsSync(outputPath)) {
    await fsp.rename(outputPath, finalOutputPath).catch(() => { });
  }

  return { outputPath: finalOutputPath };
}

