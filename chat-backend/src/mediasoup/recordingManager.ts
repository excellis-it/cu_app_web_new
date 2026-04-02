import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { types } from "mediasoup";

import { 
  getOrCreateRoom, 
  getRoomProducers, 
  startKeyframeTimer, 
  stopKeyframeTimer 
} from "./mediaRoomManager";
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
  segmentStartedAt: number; // Date.now() when the current segment's FFmpeg was launched
};

const activeSessions: Map<string, RecordingSession> = new Map();
const restartLocks: Set<string> = new Set();

const DEFAULT_RTP_BASE_PORT = 50000;
const DEFAULT_RTP_MAX_PORT = 59999;
const rtpBasePort = Number(process.env.RECORDING_RTP_BASE_PORT) || DEFAULT_RTP_BASE_PORT;
const rtpMaxPort = Number(process.env.RECORDING_RTP_MAX_PORT) || DEFAULT_RTP_MAX_PORT;
let nextPort = rtpBasePort;
const usedPorts: Set<number> = new Set();

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function allocatePortPair(): { rtpPort: number; rtcpPort: number } {
  let rtpPort = nextPort;
  let scanned = 0;
  const totalRange = rtpMaxPort - rtpBasePort;

  while (usedPorts.has(rtpPort) || usedPorts.has(rtpPort + 1)) {
    rtpPort += 2;
    if (rtpPort >= rtpMaxPort) rtpPort = rtpBasePort;
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
  // Use a delay before freeing ports in memory to ensure OS sockets are fully closed
  setTimeout(() => {
    for (const p of ports) {
      usedPorts.delete(p);
    }
    console.log(`[recording:server] ports released after cool-down: ${ports.join(", ")}`);
  }, 5000); 
}

function getLocalIp() {
  // Always use localhost for internal recording traffic (avoids firewall/external IP issues)
  return "127.0.0.1";
}

function buildSdpForConsumer(params: {
  kind: types.MediaKind;
  sdpIp: string;
  rtpPort: number;
  consumer: types.Consumer;
}) {
  const { kind, sdpIp, rtpPort, consumer } = params;
  const { rtpParameters } = consumer;

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
      ? `a=fmtp:${payloadType} ${fmtpEntries.map(([k, v]) => `${k}=${v}`).join(";")}`
      : "";

  const media = kind === "audio" ? "audio" : "video";
  return [
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
}

/**
 * Compute the optimal canvas size based on the actual participant video
 * dimensions instead of using a fixed 640×480 for every call.
 *
 *  • 1 participant  → match their native aspect ratio (capped to 1280×720)
 *  • N participants → grid-aware sizing that respects the dominant orientation
 */
/**
 * Fixed 1280×720 canvas that fills the entire frame like a real screen.
 *
 *  - 1 user  → full 1280×720
 *  - 2 users → two 640×720 cells side-by-side
 *  - 3 users → 2×2 grid (640×360 each, one cell blank)
 *  - 4 users → 2×2 grid (640×360 each)
 *  - etc.
 *
 * The grid cell sizes are computed in buildVideoGridFilter by dividing
 * the canvas by cols/rows, so we just return the fixed canvas here.
 */
function computeCanvasSize(
  _videoDimensions: Map<number, { width: number; height: number }>,
  _videoCount: number,
): { width: number; height: number } {
  return { width: 1280, height: 720 };
}

function buildVideoGridFilter(params: {
  videoInputIndices: number[];
  targetWidth: number;
  targetHeight: number;
  baseLabel: string;
}): { filterParts: string[]; videoOutputLabel: string } {
  const { videoInputIndices, targetWidth, targetHeight, baseLabel } = params;
  const n = videoInputIndices.length;

  if (n === 0) return { filterParts: [], videoOutputLabel: baseLabel };

  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const cellW = Math.floor(targetWidth / cols) & ~1;
  const cellH = Math.floor(targetHeight / rows) & ~1;

  const filterParts: string[] = [];
  let currentBase = baseLabel;

  for (let i = 0; i < n; i++) {
    const idx = videoInputIndices[i];
    const label = `sv${i}`;
    // Scale each video to fit the cell, preserving aspect ratio.
    // No rotation needed — cells are portrait-shaped (taller than wide)
    // for ≤2 users, and the scale+pad handles any aspect ratio correctly.
    const chain: string[] = [`[${idx}:v]setpts=PTS-STARTPTS,fps=15`];
    chain.push(
      `scale=${cellW}:${cellH}:force_original_aspect_ratio=decrease:flags=fast_bilinear`,
      `pad=${cellW}:${cellH}:(ow-iw)/2:(oh-ih)/2:color=black`,
    );
    filterParts.push(`${chain.join(",")}[${label}]`);

    // Overlay sv_i onto currentBase
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * cellW;
    const y = row * cellH;
    const nextBase = `ovl${i}`;
    filterParts.push(`[${currentBase}][${label}]overlay=x=${x}:y=${y}:eof_action=pass:repeatlast=1[${nextBase}]`);
    currentBase = nextBase;
  }

  return { filterParts, videoOutputLabel: currentBase };
}

function buildFfmpegArgs(params: {
  outputPath: string;
  videoInputIndices: number[];
  audioInputIndices: number[];
  sdpPathsInOrder: string[];
}) {
  const {
    outputPath,
    videoInputIndices: originalVideoIndices,
    audioInputIndices: originalAudioIndices,
    sdpPathsInOrder,
  } = params;

  const { width: targetWidth, height: targetHeight } = computeCanvasSize(
    new Map(),
    originalVideoIndices.length,
  );

  const videoInputIndices = originalVideoIndices.map(i => i + 1);
  const audioInputIndices = originalAudioIndices.map(i => i + 1);

  const args: string[] = [
    "-fflags", "+genpts+discardcorrupt+nobuffer+igndts",
    "-analyzeduration", "1000000", // 1s for the background screen
    "-probesize", "1000000",
    "-flags", "low_delay",
    "-f", "lavfi", "-i", `color=c=black:s=${targetWidth}x${targetHeight}:r=15`,
  ];

  for (const sdpPath of sdpPathsInOrder) {
    args.push(
      "-thread_queue_size", "8192",
      "-analyzeduration", "20000",  // 20ms - minimal probing since codecs are pre-declared
      "-probesize", "32000",        // 32KB - just enough for a few RTP packets
      "-fflags", "+genpts+discardcorrupt+igndts", // regenerate PTS, ignore incoming DTS (fixes restart seq jump)
      "-max_delay", "2000000",      // 2s — tolerate jitter / late packets before dropping
      "-reorder_queue_size", "256", // larger reorder buffer to reduce "missed N packets" warnings
      "-buffer_size", "20M",        // double buffer to absorb RTP bursts
      "-rw_timeout", "5000000",     // 5s - allow time for late-starting streams
      "-protocol_whitelist", "file,udp,rtp,rtcp",
    );

    // Explicitly define input format and codecs BEFORE -i to skip slow probing
    args.push("-f", "sdp", "-c:v", "vp8", "-c:a", "opus");
    args.push("-i", sdpPath);
  }

  const filterParts: string[] = [];
  const hasVideo = videoInputIndices.length > 0;
  let videoOutputLabel = "0:v";
  
  if (hasVideo) {
    const grid = buildVideoGridFilter({
      videoInputIndices,
      targetWidth,
      targetHeight,
      baseLabel: "0:v"
    });
    filterParts.push(...grid.filterParts);
    videoOutputLabel = grid.videoOutputLabel;
  }

  for (let i = 0; i < audioInputIndices.length; i++) {
    const idx = audioInputIndices[i];
    filterParts.push(`[${idx}:a]asetpts=PTS-STARTPTS,aresample=async=1000:first_pts=0[anorm${i}]`);
  }
  const normalizedAudioLabels = audioInputIndices.map((_, i) => `[anorm${i}]`).join("");
  // asetpts=N/SR/TB generates purely sequential timestamps (sample 0, 1, 2...)
  // regardless of what amix outputs. This prevents DTS resets when late-starting
  // audio streams join mid-recording. Works correctly now that use_wallclock_as_timestamps
  // is removed and RTP timestamps are consistent.
  filterParts.push(
    `${normalizedAudioLabels}amix=inputs=${audioInputIndices.length}:duration=longest:dropout_transition=0,asetpts=N/SR/TB[aout]`
  );

  args.push("-filter_complex", filterParts.join(";"));

  if (hasVideo) {
    args.push(
      "-map", `[${videoOutputLabel}]`,
      "-map", "[aout]",
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-tune", "zerolatency",
      "-crf", "28",
      "-pix_fmt", "yuv420p",
      "-g", "30",                  // keyframe every 2s at 15fps
      "-bf", "0",                  // no B-frames
      "-x264-params", "rc-lookahead=0:ref=1:me=dia:subme=0:trellis=0:weightp=0:scenecut=0",
      "-threads", "0",             // auto-detect: use all available CPU cores
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+frag_keyframe+empty_moov+default_base_moof", // fragmented MP4 for crash resilience
    );
  } else {
    args.push(
      "-map", "[aout]",
      "-c:a", "aac",
      "-b:a", "128k",
    );
  }

  args.push("-max_muxing_queue_size", "4096", "-f", "mp4", "-y", outputPath);
  return args;
}

export function isRecordingActive(recordingId: string) {
  return activeSessions.has(recordingId);
}

/**
 * Debounced restart scheduler — when a new participant joins, both audio and video
 * producers fire in quick succession. This ensures we only restart FFmpeg once per
 * burst of new producers, with a 2-second window to collect all changes.
 */
const pendingRestarts: Map<string, NodeJS.Timeout> = new Map();
const RESTART_DEBOUNCE_MS = 2000;

export function scheduleRecordingRestart(roomId: string, recordingId: string) {
  const key = `${roomId}:${recordingId}`;
  const existing = pendingRestarts.get(key);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    pendingRestarts.delete(key);
    if (!activeSessions.has(recordingId)) return;

    const producersNow = getRoomProducers(roomId);
    const isAudioOnly = !producersNow.some((p) => p.kind === "video");

    console.log(`[recording:restart] debounced restart for room=${roomId}, recording=${recordingId}`);
    restartServerRecording({ roomId, recordingId, isAudioOnly }).catch((err) => {
      console.error("[recording:restart] debounced restart failed", {
        roomId,
        recordingId,
        error: err?.message || String(err),
      });
    });
  }, RESTART_DEBOUNCE_MS);

  pendingRestarts.set(key, timer);
}

export async function recoverStaleRecordings() {
  const STALE_THRESHOLD_MS = 5 * 60 * 1000;
  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS);

  try {
    const staleCallRecordings = await CallRecording.updateMany(
      { status: { $in: ["recording", "processing"] }, updatedAt: { $lt: cutoff } },
      { $set: { status: "failed", errorMessage: "Server restarted — recording session was orphaned." } },
    );
    const staleScreenRecordings = await ScreenRecording.updateMany(
      { status: { $in: ["recording", "processing"] }, updatedAt: { $lt: cutoff } },
      { $set: { status: "failed", errorMessage: "Server restarted — recording session was orphaned." } },
    );
    const totalRecovered = (staleCallRecordings.modifiedCount || 0) + (staleScreenRecordings.modifiedCount || 0);
    if (totalRecovered > 0) {
      console.log("[recording:recovery] marked stale recordings as failed on startup");
    }
  } catch (err: any) {
    console.error("[recording:recovery] startup recovery failed", err);
  }
}

export function getActiveRecordingForRoom(roomId: string): string | null {
  for (const [recordingId, session] of activeSessions.entries()) {
    if (session.roomId === roomId) return recordingId;
  }
  return null;
}

export async function restartServerRecording(params: {
  roomId: string;
  recordingId: string;
  isAudioOnly: boolean;
}): Promise<void> {
  const { roomId, recordingId } = params;
  if (restartLocks.has(recordingId)) return;
  restartLocks.add(recordingId);

  try {
    const session = activeSessions.get(recordingId);
    if (!session) return;

    const { ffmpegProcess, streams, allocatedPorts, keyframeTimer, commonStartMicros, segments } = session;
    if (keyframeTimer) clearInterval(keyframeTimer);

    // 1. Pause all consumers FIRST so no new RTP data flows while we shut down.
    //    This prevents the new FFmpeg instance from seeing a burst of stale RTP
    //    packets with high sequence numbers from the old session.
    for (const st of streams) {
      try { await st.consumer.pause(); } catch { }
    }

    // 2. Let in-flight RTP packets drain from OS UDP buffers
    await new Promise((r) => setTimeout(r, 300));

    // 3. Graceful shutdown — send 'q' and wait up to 2s for clean exit
    try {
       ffmpegProcess.stdin?.write("q\n");
       ffmpegProcess.stdin?.end();
    } catch { }

    await new Promise((resolve) => {
      ffmpegProcess.once("close", resolve);
      setTimeout(() => {
        if (activeSessions.has(recordingId)) {
           try { ffmpegProcess.kill("SIGKILL"); } catch { }
        }
        resolve(null);
      }, 2000);
    });

    // 4. Close consumers and transports after FFmpeg is fully down
    for (const st of streams) {
      stopKeyframeTimer(st.consumer.id);
      try { st.consumer.close(); } catch { }
      try { st.transport.close(); } catch { }
    }
    releasePorts(allocatedPorts);
    activeSessions.delete(recordingId);

    // 5. Small gap so OS sockets are fully unbound before new ones are created
    await new Promise((r) => setTimeout(r, 200));

    await startServerRecording({ ...params, existingSegments: segments, sharedStartMicros: commonStartMicros });
  } finally {
    restartLocks.delete(recordingId);
  }
}

export async function startServerRecording(params: {
  roomId: string;
  recordingId: string;
  isAudioOnly: boolean;
  existingSegments?: string[];
  sharedStartMicros?: number;
}): Promise<{ outputPath: string }> {
  const { roomId, recordingId, isAudioOnly, existingSegments = [], sharedStartMicros } = params;
  if (activeSessions.has(recordingId)) {
    throw new Error(`Recording session already active for recordingId=${recordingId}`);
  }

  ensureDir(recordingConfig.tempUploadDir);
  const sessionBaseDir = path.join(recordingConfig.tempUploadDir, recordingId);
  const sdpDir = path.join(sessionBaseDir, "sdp");
  ensureDir(sessionBaseDir);
  ensureDir(sdpDir);

  const segmentIndex = existingSegments.length;
  const outputPath = path.join(sessionBaseDir, `raw_${segmentIndex}.mp4`);
  if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

  const room = await getOrCreateRoom(roomId);
  const producers = getRoomProducers(roomId);
  const audioProducers = producers.filter((p) => p.kind === "audio");
  const videoProducers = producers.filter((p) => p.kind === "video");

  const selectedVideoProducers = !isAudioOnly ? videoProducers : [];
  const selectedAudioProducers = audioProducers;
  if (selectedAudioProducers.length === 0 && selectedVideoProducers.length === 0) {
    throw new Error("No audio/video producers found for server-side recording.");
  }

  const sdpIp = getLocalIp();
  const streams: ServerStream[] = [];
  const selectedStreams = [
    ...selectedVideoProducers.map((p) => ({ producerId: p.producerId, kind: "video" as const, width: p.width, height: p.height })),
    ...selectedAudioProducers.map((p) => ({ producerId: p.producerId, kind: "audio" as const })),
  ];

  for (let i = 0; i < selectedStreams.length; i++) {
    const s = selectedStreams[i];
    const { rtpPort, rtcpPort } = allocatePortPair();
    const transport = await room.router.createPlainTransport({ listenIp: sdpIp, rtcpMux: false, comedia: false });
    await transport.connect({ ip: sdpIp, port: rtpPort, rtcpPort });
    const consumer = await transport.consume({ producerId: s.producerId, rtpCapabilities: room.router.rtpCapabilities, paused: true });
    if (s.kind === "video") {
      try { await (consumer as any).setPreferredLayers?.({ spatialLayer: 0, temporalLayer: 0 }); } catch { }
      startKeyframeTimer(consumer);
    }
    const sdpPath = path.join(sdpDir, `stream-${i}.sdp`);
    const sdp = buildSdpForConsumer({ kind: s.kind, sdpIp, rtpPort, consumer });
    await fsp.writeFile(sdpPath, sdp, "utf8");
    // Determine video dimensions: prefer appData from producer, then fall back to
    // consumer RTP encoding parameters, then a safe default (640x480).
    let streamWidth = (s as any).width as number | undefined;
    let streamHeight = (s as any).height as number | undefined;
    if (s.kind === "video" && (!streamWidth || !streamHeight)) {
      const enc = consumer.rtpParameters?.encodings?.[0];
      const scaleDown = (enc as any)?.scaleResolutionDownBy || 1;
      // Try to get dimensions from consumer's RTP header extensions or track
      const consumerWidth = (enc as any)?.width;
      const consumerHeight = (enc as any)?.height;
      if (consumerWidth && consumerHeight) {
        streamWidth = Math.round(consumerWidth / scaleDown);
        streamHeight = Math.round(consumerHeight / scaleDown);
      } else {
        // Default fallback — most webcams are 640x480 or 320x240
        streamWidth = streamWidth || 640;
        streamHeight = streamHeight || 480;
      }
    }

    streams.push({
      producerId: s.producerId,
      kind: s.kind,
      transport,
      consumer,
      rtpPort,
      rtcpPort,
      sdpPath,
      width: streamWidth,
      height: streamHeight,
    });
  }

  // Minimal wait for transport readiness
  await new Promise((r) => setTimeout(r, 100));
  const deadStreams = streams.filter((st) => st.consumer.closed);
  if (deadStreams.length > 0) {
    for (const st of deadStreams) {
      try { st.consumer.close(); } catch { }
      try { st.transport.close(); } catch { }
    }
    releasePorts(deadStreams.flatMap((st) => [st.rtpPort, st.rtcpPort]));
  }
  const liveStreams = streams.filter((st) => !st.consumer.closed);

  if (liveStreams.length === 0) throw new Error("No live streams remain.");
  if (!liveStreams.some((st) => st.kind === "audio")) throw new Error("No live audio consumers remain.");

  const sdpPathsInOrder = liveStreams.map((st) => st.sdpPath);
  const videoInputIndices: number[] = [];
  const audioInputIndices: number[] = [];
  for (let i = 0; i < liveStreams.length; i++) {
    if (liveStreams[i].kind === "video") videoInputIndices.push(i);
    else audioInputIndices.push(i);
  }

  const commonStartMicros = sharedStartMicros || Date.now() * 1000;

  // 1. Start FFmpeg FIRST so it opens UDP sockets before any data flows
  const args = buildFfmpegArgs({
    outputPath,
    videoInputIndices,
    audioInputIndices,
    sdpPathsInOrder,
  });

  const ffmpegStderrPrefix = `[recording:${recordingId}] ffmpeg`;
  const ffmpegProcess = spawn(ffmpegBinary, args, { stdio: ["pipe", "pipe", "pipe"] });

  ffmpegProcess.stderr.on("data", (chunk) => {
    const lines = chunk.toString().split("\n");
    for (const line of lines) {
      if (line.trim()) console.log(`${ffmpegStderrPrefix} ${line.trim()}`);
    }
  });

  let ffmpegErred = false;
  ffmpegProcess.on("error", (err) => {
    console.error(`[recording:${recordingId}] ffmpeg spawn error:`, err);
    ffmpegErred = true;
  });

  // 2. Wait for FFmpeg to initialize and open UDP sockets
  await new Promise((r) => setTimeout(r, 300));
  if (ffmpegProcess.exitCode !== null) {
     console.error(`[recording:${recordingId}] ffmpeg exited immediately with code ${ffmpegProcess.exitCode}`);
     throw new Error(`FFmpeg failed to start for segment ${segmentIndex}`);
  }

  // 3. Resume consumers ONE BY ONE with gaps — FFmpeg probes inputs sequentially,
  //    so staggering prevents later inputs' UDP buffers from overflowing while
  //    FFmpeg is still probing earlier inputs.
  //    For video: request a keyframe BEFORE resuming so the very first data FFmpeg
  //    sees is a keyframe, avoiding the "Keyframe missing" warning.
  for (const st of liveStreams) {
    try {
      if (st.kind === "video") {
        // Pre-request keyframe so the producer queues one up for delivery on resume
        (st.consumer as any).requestKeyFrame?.().catch(() => {});
        await new Promise((r) => setTimeout(r, 50));
      }
      await st.consumer.resume();
      if (st.kind === "video") {
        // Request again immediately after resume for redundancy
        (st.consumer as any).requestKeyFrame?.().catch(() => {});
      }
    } catch { }
    // Give FFmpeg time to detect and start reading this input before the next one
    await new Promise((r) => setTimeout(r, 300));
  }

  // 4. Verify FFmpeg is still running after all consumers are up
  if (ffmpegProcess.exitCode !== null) {
     console.error(`[recording:${recordingId}] ffmpeg exited during consumer setup with code ${ffmpegProcess.exitCode}`);
     throw new Error(`FFmpeg failed during startup for segment ${segmentIndex}`);
  }

  // 5. Request keyframes from all video consumers for a clean start
  for (const st of liveStreams) {
    if (st.kind === "video") (st.consumer as any).requestKeyFrame?.().catch(() => {});
  }

  const keyframeTimer = setInterval(() => {
    for (const st of liveStreams) {
      if (st.kind === "video" && !st.consumer.closed) {
        (st.consumer as any).requestKeyFrame?.().catch(() => {});
      }
    }
  }, 2000);

  // 6. Aggressive keyframe poking for the first 3 seconds to force timeline sync
  for (const st of liveStreams) {
    if (st.kind === "video") {
      let pokes = 0;
      const pokeInterval = setInterval(() => {
        if (st.consumer.closed || pokes++ > 15) {
          clearInterval(pokeInterval);
          return;
        }
        (st.consumer as any).requestKeyFrame?.().catch(() => {});
      }, 200);
    }
  }

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
    segmentStartedAt: Date.now()
  };
  activeSessions.set(recordingId, session);

  ffmpegProcess.once("close", (code) => {
    if (activeSessions.has(recordingId)) {
      const s = activeSessions.get(recordingId)!;
      s.ffmpegExited = true; 
      s.ffmpegExitCode = code;
    }
    console.log(`[recording:${recordingId}] ffmpeg process closed with code ${code}`);
  });

  return { outputPath };
}

export async function stopServerRecording(recordingId: string): Promise<{ outputPath: string }> {
  const session = activeSessions.get(recordingId);
  if (!session) throw new Error(`No session for ${recordingId}`);
  activeSessions.delete(recordingId);

  const { ffmpegProcess, outputPath, allocatedPorts, keyframeTimer, segments, streams, segmentStartedAt } = session;
  if (keyframeTimer) clearInterval(keyframeTimer);

  // If the current segment was started very recently (e.g. just after a restart),
  // wait for FFmpeg to stabilize before stopping. This prevents a near-empty or
  // corrupted final segment that would ruin the merged output.
  const MIN_SEGMENT_MS = 5000;
  const elapsed = Date.now() - segmentStartedAt;
  if (elapsed < MIN_SEGMENT_MS) {
    const waitMs = MIN_SEGMENT_MS - elapsed;
    console.log(`[recording:${recordingId}] waiting ${waitMs}ms for segment to stabilize before stop`);
    await new Promise((r) => setTimeout(r, waitMs));
  }

  // Wait for pending buffers
  await new Promise((r) => setTimeout(r, 1000));

  if (!session.ffmpegExited) {
    try { 
       ffmpegProcess.stdin?.write("q\n");
       ffmpegProcess.stdin?.end();
    } catch { }

    await new Promise((resolve) => {
      ffmpegProcess.once("close", resolve);
      // More aggressive fallback if graceful 'q' fail
      setTimeout(() => { 
        if (!session.ffmpegExited) {
          ffmpegProcess.kill("SIGKILL");
        }
        resolve(null);
      }, 3000);
    });
  }

  for (const st of streams) {
    stopKeyframeTimer(st.consumer.id);
    try { st.consumer.close(); } catch { }
    try { st.transport.close(); } catch { }
  }
  releasePorts(allocatedPorts);

  if (session.segments.length > 1) {
    const finalOutputPath = path.join(path.dirname(outputPath), "raw.mp4");
    const concatListPath = path.join(path.dirname(outputPath), "concat-list-server.txt");
    const concatContent = session.segments.map(s => `file '${path.resolve(s).replaceAll("\\", "/")}'`).join("\n");
    await fsp.writeFile(concatListPath, concatContent, "utf8");
    try {
      console.log(`[recording:server] merging ${session.segments.length} segments into ${finalOutputPath}`);
      // Re-encode BOTH video and audio during merge to fully reset timestamps
      // across segment boundaries. Video stream-copy caused Non-monotonous DTS
      // errors when segment timestamps were discontinuous. Re-encoding is slower
      // but guarantees clean, sequential timestamps in the final output.
      const ffmpeg = spawn(ffmpegBinary, [
        "-y",
        "-fflags", "+genpts+igndts",
        "-f", "concat",
        "-safe", "0",
        "-i", concatListPath,
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-vf", "setpts=N/FR/TB",     // sequential video timestamps based on frame rate
        "-c:a", "aac",
        "-b:a", "128k",
        "-af", "asetpts=N/SR/TB,aresample=async=1000",
        "-movflags", "+faststart",
        "-max_muxing_queue_size", "4096",
        finalOutputPath
      ]);
      
      ffmpeg.stdout.on("data", (d) => console.log(`[recording:merge] stdout: ${d.toString().trim()}`));
      ffmpeg.stderr.on("data", (d) => console.log(`[recording:merge] stderr: ${d.toString().trim()}`));

      await new Promise((resolve, reject) => {
        ffmpeg.on("close", (code) => {
          if (code === 0) {
            console.log(`[recording:merge] success: ${finalOutputPath}`);
            resolve(null);
          } else {
            reject(new Error(`FFmpeg concat failed with code ${code}`));
          }
        });
      });
      return { outputPath: finalOutputPath };
    } catch (err: any) {
      console.error("[recording:server] merge failed, returning latest segment only", err);
      return { outputPath };
    }
  }

  const finalOutputPath = path.join(path.dirname(outputPath), "raw.mp4");
  if (fs.existsSync(outputPath)) await fsp.rename(outputPath, finalOutputPath).catch(() => { });
  return { outputPath: finalOutputPath };
}
