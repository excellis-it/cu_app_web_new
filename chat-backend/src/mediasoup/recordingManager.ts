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
const ffprobeBinary = ffmpegBinary.replace(/ffmpeg(\.exe)?$/, "ffprobe$1");

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
  rotation?: number;
  source?: string;
  portraitLock?: boolean;
  hasVideoOrientationExtmap?: boolean;
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
  latestEncodedTimeSec: number;
  commonStartMicros: number;
  startedAtMs: number;
  topologySignature: string;
  segments: string[];
};

const activeSessions: Map<string, RecordingSession> = new Map();
const restartLocks: Set<string> = new Set();

const DEFAULT_RTP_BASE_PORT = 50000;
const DEFAULT_RTP_MAX_PORT = 59999;
const rtpBasePort = Number(process.env.RECORDING_RTP_BASE_PORT) || DEFAULT_RTP_BASE_PORT;
const rtpMaxPort = Number(process.env.RECORDING_RTP_MAX_PORT) || DEFAULT_RTP_MAX_PORT;
const applyHalfTurnRotation = String(process.env.RECORDING_APPLY_180_ROTATION || "").toLowerCase() === "true";
const recordingOutputFps = Math.max(
  6,
  Math.min(24, Number(process.env.RECORDING_OUTPUT_FPS) || 10),
);
const recordingCanvasWidth = Math.max(
  320,
  Number(process.env.RECORDING_CANVAS_WIDTH) || 854,
) & ~1;
const recordingCanvasHeight = Math.max(
  240,
  Number(process.env.RECORDING_CANVAS_HEIGHT) || 480,
) & ~1;
const recordingStopTimeoutMs = Math.max(
  3000,
  Number(process.env.RECORDING_FFMPEG_STOP_TIMEOUT_MS) || 20000,
);
const recordingInputThreadQueueSize = Math.max(
  1024,
  Number(process.env.RECORDING_INPUT_THREAD_QUEUE_SIZE) || 8192,
);
const recordingInputMaxDelayUs = Math.max(
  100000,
  Number(process.env.RECORDING_INPUT_MAX_DELAY_US) || 600000,
);
const recordingInputReorderQueueSize = Math.max(
  32,
  Number(process.env.RECORDING_INPUT_REORDER_QUEUE_SIZE) || 256,
);
const recordingInputBufferSize = process.env.RECORDING_INPUT_BUFFER_SIZE || "8M";
const recordingInputRwTimeoutUs = Math.max(
  3000000,
  Number(process.env.RECORDING_INPUT_RW_TIMEOUT_US) || 10000000,
);
const recordingSigintTimeoutMs = Math.max(
  2000,
  Number(process.env.RECORDING_FFMPEG_SIGINT_TIMEOUT_MS) || 7000,
);
const recordingSigtermTimeoutMs = Math.max(
  2000,
  Number(process.env.RECORDING_FFMPEG_SIGTERM_TIMEOUT_MS) || 5000,
);
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

function isUsableRecordingFile(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() && stat.size > 1024;
  } catch {
    return false;
  }
}

async function getMediaDurationSeconds(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn(
      ffprobeBinary,
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        path.resolve(filePath),
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    let stdout = "";
    proc.stdout.on("data", (chunk: any) => {
      stdout += chunk.toString();
    });
    proc.on("error", () => resolve(0));
    proc.on("close", (code: any) => {
      if (code !== 0) {
        resolve(0);
        return;
      }
      const duration = Number.parseFloat(String(stdout).trim());
      resolve(Number.isFinite(duration) && duration > 0 ? duration : 0);
    });
  });
}

async function isPlayableRecordingFile(filePath: string): Promise<boolean> {
  if (!isUsableRecordingFile(filePath)) return false;
  const duration = await getMediaDurationSeconds(filePath);
  return duration > 0;
}

async function findLatestPlayableSegment(segments: string[]): Promise<string | null> {
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const segmentPath = segments[i];
    // eslint-disable-next-line no-await-in-loop
    if (await isPlayableRecordingFile(segmentPath)) return segmentPath;
  }
  return null;
}

function runFfmpegCommand(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBinary, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    let stdout = "";

    proc.stdout.on("data", (chunk: any) => {
      if (stdout.length < 4000) stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk: any) => {
      if (stderr.length < 8000) stderr += chunk.toString();
    });
    proc.on("error", (error: any) => reject(error));
    proc.on("close", (code: any) => {
      if (code === 0) return resolve();
      reject(
        new Error(
          `ffmpeg failed with code ${code}. stderr=${stderr.slice(0, 2000)} stdout=${stdout.slice(0, 1000)}`,
        ),
      );
    });
  });
}

function waitForProcessClose(
  proc: ReturnType<typeof spawn>,
  timeoutMs: number,
): Promise<boolean> {
  if (proc.exitCode !== null) return Promise.resolve(true);

  return new Promise((resolve) => {
    let settled = false;
    const done = (closed: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(closed);
    };

    const onClose = () => done(true);
    proc.once("close", onClose);

    const timer = setTimeout(() => {
      proc.removeListener("close", onClose);
      done(proc.exitCode !== null);
    }, timeoutMs);
  });
}

async function shutdownFfmpegProcess(params: {
  session: RecordingSession;
  ffmpegProcess: ReturnType<typeof spawn>;
  recordingId: string;
  context: "stop" | "restart";
}): Promise<void> {
  const {
    session,
    ffmpegProcess,
    recordingId,
    context,
  } = params;

  if (session.ffmpegExited || ffmpegProcess.exitCode !== null) return;

  try {
    ffmpegProcess.stdin?.write("q\n");
    ffmpegProcess.stdin?.end();
  } catch {
    // ignore
  }

  let closed = await waitForProcessClose(ffmpegProcess, recordingStopTimeoutMs);
  if (closed || session.ffmpegExited) return;

  console.warn(`[recording:${recordingId}] ffmpeg did not exit after q, sending SIGINT`, {
    context,
  });
  try {
    ffmpegProcess.kill("SIGINT");
  } catch {
    // ignore
  }

  closed = await waitForProcessClose(ffmpegProcess, recordingSigintTimeoutMs);
  if (closed || session.ffmpegExited) return;

  console.warn(`[recording:${recordingId}] ffmpeg still running after SIGINT, sending SIGTERM`, {
    context,
  });
  try {
    ffmpegProcess.kill("SIGTERM");
  } catch {
    // ignore
  }

  closed = await waitForProcessClose(ffmpegProcess, recordingSigtermTimeoutMs);
  if (closed || session.ffmpegExited) return;

  console.warn(`[recording:${recordingId}] ffmpeg still running after SIGTERM, sending SIGKILL`, {
    context,
  });
  try {
    ffmpegProcess.kill("SIGKILL");
  } catch {
    // ignore
  }

  await waitForProcessClose(ffmpegProcess, 2000);
}

async function repairNonPlayableSegment(segmentPath: string, recordingId: string): Promise<string | null> {
  const dir = path.dirname(segmentPath);
  const stem = path.basename(segmentPath, path.extname(segmentPath));
  const repairedPath = path.join(dir, `${stem}_repaired.mp4`);

  const attempts: Array<{ mode: "copy-video" | "reencode-video"; args: string[] }> = [
    {
      mode: "copy-video",
      args: [
        "-y",
        "-fflags",
        "+genpts+igndts+discardcorrupt",
        "-err_detect",
        "ignore_err",
        "-i",
        path.resolve(segmentPath),
        "-map",
        "0:v:0?",
        "-map",
        "0:a:0?",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-af",
        "aresample=async=1000,asetpts=N/SR/TB",
        "-movflags",
        "+faststart",
        "-max_muxing_queue_size",
        "4096",
        path.resolve(repairedPath),
      ],
    },
    {
      mode: "reencode-video",
      args: [
        "-y",
        "-fflags",
        "+genpts+igndts+discardcorrupt",
        "-err_detect",
        "ignore_err",
        "-i",
        path.resolve(segmentPath),
        "-map",
        "0:v:0?",
        "-map",
        "0:a:0?",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-tune",
        "zerolatency",
        "-crf",
        "30",
        "-pix_fmt",
        "yuv420p",
        "-r",
        String(recordingOutputFps),
        "-g",
        String(recordingOutputFps * 2),
        "-bf",
        "0",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-af",
        "aresample=async=1000,asetpts=N/SR/TB",
        "-movflags",
        "+faststart",
        "-max_muxing_queue_size",
        "4096",
        path.resolve(repairedPath),
      ],
    },
  ];

  for (const attempt of attempts) {
    try {
      await fsp.rm(repairedPath, { force: true });
      // eslint-disable-next-line no-await-in-loop
      await runFfmpegCommand(attempt.args);
      // eslint-disable-next-line no-await-in-loop
      const repairedPlayable = await isPlayableRecordingFile(repairedPath);
      if (repairedPlayable) {
        console.warn("[recording:server] repaired non-playable segment", {
          recordingId,
          source: segmentPath,
          repairedPath,
          mode: attempt.mode,
        });
        return repairedPath;
      }
    } catch (error: any) {
      console.warn("[recording:server] segment repair attempt failed", {
        recordingId,
        source: segmentPath,
        mode: attempt.mode,
        error: error?.message || String(error),
      });
    }
  }

  return null;
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
  const extmapLines = (rtpParameters.headerExtensions || []).map((ext) => {
    const encryptFlag = ext.encrypt ? "/encrypt" : "";
    return `a=extmap:${ext.id}${encryptFlag} ${ext.uri}`;
  });

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
    ...extmapLines,
    "a=recvonly",
    "a=rtcp-mux",
  ]
    .filter(Boolean)
    .join("\n");
}

function hasVideoOrientationExtmap(consumer: types.Consumer): boolean {
  return (consumer.rtpParameters?.headerExtensions || []).some(
    (ext) => String(ext.uri || "").toLowerCase() === "urn:3gpp:video-orientation",
  );
}

/**
 * Compute a reliability-first canvas size.
 *
 * Lowering total pixel count for larger rooms keeps encode speed >= realtime,
 * which prevents packet-backlog drops and truncated output duration.
 *
 * Values can be tuned via env:
 * - RECORDING_CANVAS_WIDTH
 * - RECORDING_CANVAS_HEIGHT
 */
function computeCanvasSize(
  _videoDimensions: Map<number, { width: number; height: number }>,
  videoCount: number,
): { width: number; height: number } {
  if (videoCount >= 5) {
    return {
      width: Math.min(recordingCanvasWidth, 480),
      height: Math.min(recordingCanvasHeight, 270),
    };
  }

  if (videoCount >= 3) {
    return {
      width: Math.min(recordingCanvasWidth, 640),
      height: Math.min(recordingCanvasHeight, 360),
    };
  }

  return { width: recordingCanvasWidth, height: recordingCanvasHeight };
}

function buildVideoGridFilter(params: {
  videoInputIndices: number[];
  targetWidth: number;
  targetHeight: number;
  videoDimensions?: Map<
    number,
    {
      width: number;
      height: number;
      rotation?: number;
      source?: string;
      portraitLock?: boolean;
      hasVideoOrientationExtmap?: boolean;
    }
  >;
  baseLabel: string;
}): { filterParts: string[]; videoOutputLabel: string } {
  const { videoInputIndices, targetWidth, targetHeight, videoDimensions, baseLabel } = params;
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
    const dims = videoDimensions?.get(idx - 1);
    const streamHasVideoOrientationExtmap = !!dims?.hasVideoOrientationExtmap;
    const normalizedRotation = (() => {
      if (!dims || typeof dims.rotation !== "number") return 0;
      const r = ((dims.rotation % 360) + 360) % 360;
      if (r === 90 || r === 180 || r === 270) return r;
      return 0;
    })();
    const hasExplicitRotation = normalizedRotation !== 0;
    const isFlutterPortraitLocked =
      String(dims?.source || "").toLowerCase() === "flutter-app" &&
      dims?.portraitLock === true;
    const effectiveWidth =
      dims && normalizedRotation % 180 !== 0 ? dims.height : dims?.width;
    const effectiveHeight =
      dims && normalizedRotation % 180 !== 0 ? dims.width : dims?.height;
    const isPortrait = !!(effectiveWidth && effectiveHeight && effectiveHeight > effectiveWidth);
    const isLandscape = !!(effectiveWidth && effectiveHeight && effectiveWidth >= effectiveHeight);

    // Scale each video to fit the cell, preserving aspect ratio.
    // Orientation source priority:
    // 1) Apply explicit right-angle appData.rotation when present.
    // 2) For Flutter portrait-locked publishers that still report landscape-native
    //    dimensions and rotation=0, force portrait transpose.
    // 3) Keep legacy portrait fallback for streams that do not expose
    //    video-orientation extmap metadata.
    const chain: string[] = [
      `[${idx}:v]setpts=PTS-STARTPTS,fps=${recordingOutputFps}`,
    ];
    if (streamHasVideoOrientationExtmap && hasExplicitRotation) {
      console.log("[recording:orientation] video-orientation extmap present; still honoring explicit appData.rotation", {
        streamIndex: i,
        appRotation: normalizedRotation,
      });
    }

    if (normalizedRotation === 90) {
      chain.push("transpose=1");
    } else if (normalizedRotation === 270) {
      chain.push("transpose=2:passthrough=portrait");
    } else if (normalizedRotation === 180) {
      // Half-turn orientation from mobile app metadata is often unstable.
      // Keep it opt-in so recordings stay upright by default.
      if (applyHalfTurnRotation) {
        chain.push("hflip,vflip");
      } else {
        console.log("[recording:orientation] skipping appData 180 rotation (set RECORDING_APPLY_180_ROTATION=true to enable)", {
          streamIndex: i,
        });
      }
    } else if (isFlutterPortraitLocked && isLandscape) {
      // Flutter app is portrait-locked in-call, but the camera track can still
      // report landscape-native dimensions with rotation=0 in producer metadata.
      // Apply a recording-only correction so final composites stay upright.
      chain.push("transpose=1:passthrough=portrait");
      console.log("[recording:orientation] applied flutter portrait-lock transpose fallback", {
        streamIndex: i,
        width: effectiveWidth,
        height: effectiveHeight,
      });
    } else if (!streamHasVideoOrientationExtmap && !hasExplicitRotation && isPortrait) {
      chain.push("transpose=2:passthrough=portrait");
    }
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
  videoDimensions?: Map<
    number,
    {
      width: number;
      height: number;
      rotation?: number;
      source?: string;
      portraitLock?: boolean;
      hasVideoOrientationExtmap?: boolean;
    }
  >;
}) {
  const {
    outputPath,
    videoInputIndices: originalVideoIndices,
    audioInputIndices: originalAudioIndices,
    sdpPathsInOrder,
  } = params;

  const { width: targetWidth, height: targetHeight } = computeCanvasSize(
    params.videoDimensions ?? new Map(),
    originalVideoIndices.length,
  );

  const videoInputIndices = originalVideoIndices.map(i => i + 1);
  const audioInputIndices = originalAudioIndices.map(i => i + 1);

  const args: string[] = [
    "-fflags", "+genpts+igndts+discardcorrupt",
    "-max_interleave_delta", "1000000",
    "-f", "lavfi", "-i", `color=c=black:s=${targetWidth}x${targetHeight}:r=${recordingOutputFps}`,
  ];

  for (const sdpPath of sdpPathsInOrder) {
    args.push(
      "-thread_queue_size", String(recordingInputThreadQueueSize),
      "-fflags", "+genpts+igndts+discardcorrupt",
      "-analyzeduration", "300000",
      "-probesize", "300000",
      "-max_delay", String(recordingInputMaxDelayUs),
      "-reorder_queue_size", String(recordingInputReorderQueueSize),
      "-buffer_size", recordingInputBufferSize,
      "-rw_timeout", String(recordingInputRwTimeoutUs),
      "-protocol_whitelist", "file,udp,rtp,rtcp",
    );

    // Keep codec detection dynamic from each SDP input so mixed VP8/H264 rooms
    // (web + flutter/mobile) are recorded correctly.
    args.push("-f", "sdp");
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
      videoDimensions: params.videoDimensions,
      baseLabel: "0:v"
    });
    filterParts.push(...grid.filterParts);
    videoOutputLabel = grid.videoOutputLabel;
  }

  for (let i = 0; i < audioInputIndices.length; i++) {
    const idx = audioInputIndices[i];
    filterParts.push(
      `[${idx}:a]aresample=async=1000:min_hard_comp=0.100,asetpts=N/SR/TB[anorm${i}]`,
    );
  }
  if (audioInputIndices.length === 1) {
    // Avoid amix for a single RTP audio input to reduce timestamp jitter.
    filterParts.push("[anorm0]asetpts=N/SR/TB[aout]");
  } else {
    const normalizedAudioLabels = audioInputIndices.map((_, i) => `[anorm${i}]`).join("");
    // Keep audio timeline monotonic and resilient to late/jittery RTP.
    // Per-stream aresample already handles async gap-filling.
    // A second aresample with forced first_pts after amix can reset its internal
    // timestamp origin when late RTP drops cause discontinuities, which cascades
    // into non-monotonous DTS in the MP4 muxer. Using only asetpts=N/SR/TB
    // after amix guarantees a strictly monotonic sample-counter timeline.
    filterParts.push(
      `${normalizedAudioLabels}amix=inputs=${audioInputIndices.length}:duration=longest:dropout_transition=2:normalize=0,asetpts=N/SR/TB[aout]`
    );
  }

  args.push("-filter_complex", filterParts.join(";"));

  if (hasVideo) {
    args.push(
      "-map", `[${videoOutputLabel}]`,
      "-map", "[aout]",
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-tune", "zerolatency",
      "-crf", "30",
      "-pix_fmt", "yuv420p",
      "-r", String(recordingOutputFps),
      "-vsync", "cfr",
      "-g", String(recordingOutputFps * 2),
      "-bf", "0",                  // no B-frames
      "-x264-params", "rc-lookahead=0:ref=1:me=dia:subme=0:trellis=0:weightp=0:scenecut=0",
      "-threads", "0",             // auto-detect: use all available CPU cores
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      "-muxpreload", "0",
      "-muxdelay", "0",
    );
  } else {
    args.push(
      "-map", "[aout]",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
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
const MIN_RESTART_SESSION_AGE_MS = 6000;

function buildTopologySignature(
  producers: Array<{ producerId: string; kind: types.MediaKind }>,
): string {
  return producers
    .map((p) => `${p.kind}:${p.producerId}`)
    .sort()
    .join("|");
}

export function scheduleRecordingRestart(roomId: string, recordingId: string) {
  const key = `${roomId}:${recordingId}`;
  const existing = pendingRestarts.get(key);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    pendingRestarts.delete(key);
    const session = activeSessions.get(recordingId);
    if (!session) return;

    const sessionAgeMs = Date.now() - session.startedAtMs;
    if (sessionAgeMs < MIN_RESTART_SESSION_AGE_MS) {
      const deferMs = Math.max(500, MIN_RESTART_SESSION_AGE_MS - sessionAgeMs);
      const deferred = setTimeout(() => {
        scheduleRecordingRestart(roomId, recordingId);
      }, deferMs);
      pendingRestarts.set(key, deferred);
      console.log("[recording:restart] deferring restart for young session", {
        roomId,
        recordingId,
        sessionAgeMs,
        deferMs,
      });
      return;
    }

    const producersNow = getRoomProducers(roomId);
    const currentTopologySignature = buildTopologySignature(
      producersNow.map((p) => ({ producerId: p.producerId, kind: p.kind })),
    );

    if (currentTopologySignature === session.topologySignature) {
      console.log("[recording:restart] skip restart (topology unchanged)", {
        roomId,
        recordingId,
        topologySignature: currentTopologySignature,
      });
      return;
    }

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
    // If a stop flow has already switched DB status away from "recording",
    // do not interrupt the active session here. Let stopServerRecording own teardown.
    const [callRecBefore, screenRecBefore] = await Promise.all([
      CallRecording.findById(recordingId, { status: 1 }).lean() as any,
      ScreenRecording.findById(recordingId, { status: 1 }).lean() as any,
    ]);
    const shouldRestartNow =
      callRecBefore?.status === "recording" || screenRecBefore?.status === "recording";
    if (!shouldRestartNow) {
      console.log("[recording:restart] skip restart because recording is not active", {
        roomId,
        recordingId,
        callStatus: callRecBefore?.status,
        screenStatus: screenRecBefore?.status,
      });
      return;
    }

    const session = activeSessions.get(recordingId);
    if (!session) return;

    const { ffmpegProcess, streams, allocatedPorts, keyframeTimer, commonStartMicros, segments } = session;
    if (keyframeTimer) clearInterval(keyframeTimer);

    // Pause streams first to reduce in-flight RTP bursts before quitting ffmpeg.
    for (const st of streams) {
      try {
        await st.consumer.pause();
      } catch {
        // Ignore pause failures during restart teardown.
      }
    }
    await new Promise((r) => setTimeout(r, 250));

    // Prefer graceful FFmpeg termination to preserve MP4 metadata.
    await shutdownFfmpegProcess({
      session,
      ffmpegProcess,
      recordingId,
      context: "restart",
    });

    for (const st of streams) {
      stopKeyframeTimer(st.consumer.id);
      try { st.consumer.close(); } catch { }
      try { st.transport.close(); } catch { }
    }
    releasePorts(allocatedPorts);
    activeSessions.delete(recordingId);

    // If the recording was stopped while restart was in-flight, do not spin up
    // a new segment.
    const [callRec, screenRec] = await Promise.all([
      CallRecording.findById(recordingId, { status: 1 }).lean() as any,
      ScreenRecording.findById(recordingId, { status: 1 }).lean() as any,
    ]);
    const stillRecordingActive =
      callRec?.status === "recording" || screenRec?.status === "recording";
    if (!stillRecordingActive) {
      console.log("[recording:restart] skip restart because recording is no longer active", {
        roomId,
        recordingId,
        callStatus: callRec?.status,
        screenStatus: screenRec?.status,
      });
      return;
    }

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
    ...selectedVideoProducers.map((p) => ({
      producerId: p.producerId,
      kind: "video" as const,
      width: p.width,
      height: p.height,
      rotation: p.rotation,
      source: p.source,
      portraitLock: p.portraitLock,
    })),
    ...selectedAudioProducers.map((p) => ({ producerId: p.producerId, kind: "audio" as const })),
  ];
  const topologySignature = buildTopologySignature(
    selectedStreams.map((s) => ({ producerId: s.producerId, kind: s.kind })),
  );

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
      rotation: (s as any).rotation,
      source: (s as any).source,
      portraitLock: (s as any).portraitLock,
      hasVideoOrientationExtmap:
        s.kind === "video" ? hasVideoOrientationExtmap(consumer) : false,
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

  const videoDimensions = new Map<
    number,
    {
      width: number;
      height: number;
      rotation?: number;
      source?: string;
      portraitLock?: boolean;
      hasVideoOrientationExtmap?: boolean;
    }
  >();
  for (let i = 0; i < liveStreams.length; i++) {
    const stream = liveStreams[i];
    if (stream.kind === "video" && stream.width && stream.height) {
      videoDimensions.set(i, {
        width: stream.width,
        height: stream.height,
        rotation: stream.rotation,
        source: stream.source,
        portraitLock: stream.portraitLock,
        hasVideoOrientationExtmap: stream.hasVideoOrientationExtmap,
      });
    }
  }

  const commonStartMicros = sharedStartMicros || Date.now() * 1000;

  // 1. Start FFmpeg FIRST so it opens UDP sockets before any data flows
  const args = buildFfmpegArgs({
    outputPath,
    videoInputIndices,
    audioInputIndices,
    sdpPathsInOrder,
    videoDimensions,
  });

  console.log("[recording:profile]", {
    recordingId,
    targetWidth: computeCanvasSize(videoDimensions, videoInputIndices.length).width,
    targetHeight: computeCanvasSize(videoDimensions, videoInputIndices.length).height,
    fps: recordingOutputFps,
    videoInputs: videoInputIndices.length,
    audioInputs: audioInputIndices.length,
  });

  const ffmpegStderrPrefix = `[recording:${recordingId}] ffmpeg`;
  const ffmpegProcess = spawn(ffmpegBinary, args, { stdio: ["pipe", "pipe", "pipe"] });
  let sessionRef: RecordingSession | null = null;

  ffmpegProcess.stderr.on("data", (chunk) => {
    const lines = chunk.toString().split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const progressMatch = /time=(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(trimmed);
      if (progressMatch) {
        const h = Number(progressMatch[1]) || 0;
        const m = Number(progressMatch[2]) || 0;
        const s = Number(progressMatch[3]) || 0;
        const encodedTimeSec = h * 3600 + m * 60 + s;
        const active = activeSessions.get(recordingId);
        if (active && encodedTimeSec > active.latestEncodedTimeSec) {
          active.latestEncodedTimeSec = encodedTimeSec;
        }
        if (sessionRef && encodedTimeSec > sessionRef.latestEncodedTimeSec) {
          sessionRef.latestEncodedTimeSec = encodedTimeSec;
        }
      }

      console.log(`${ffmpegStderrPrefix} ${trimmed}`);
    }
  });

  let ffmpegErred = false;
  ffmpegProcess.on("error", (err) => {
    console.error(`[recording:${recordingId}] ffmpeg spawn error:`, err);
    ffmpegErred = true;
  });

  // 2. Wait for FFmpeg to initialize and open UDP sockets
  await new Promise((r) => setTimeout(r, 100));
  if (ffmpegProcess.exitCode !== null) {
     console.error(`[recording:${recordingId}] ffmpeg exited immediately with code ${ffmpegProcess.exitCode}`);
     throw new Error(`FFmpeg failed to start for segment ${segmentIndex}`);
  }

  // 3. Resume consumers ONE BY ONE with gaps — FFmpeg probes inputs sequentially,
  //    so staggering prevents later inputs' UDP buffers from overflowing while
  //    FFmpeg is still probing earlier inputs
  for (const st of liveStreams) {
    try {
      await st.consumer.resume();
      if (st.kind === "video") {
        (st.consumer as any).requestKeyFrame?.().catch(() => {});
      }
    } catch { }
    // Give FFmpeg time to detect and start reading this input before the next one
    await new Promise((r) => setTimeout(r, 150));
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
    latestEncodedTimeSec: 0,
    commonStartMicros, 
    startedAtMs: Date.now(),
    topologySignature,
    segments: [...existingSegments, outputPath] 
  };
  activeSessions.set(recordingId, session);
  sessionRef = session;

  ffmpegProcess.once("close", (code) => {
    if (sessionRef) {
      sessionRef.ffmpegExited = true;
      sessionRef.ffmpegExitCode = code;
    }
    const active = activeSessions.get(recordingId);
    if (active && active !== sessionRef) {
      active.ffmpegExited = true;
      active.ffmpegExitCode = code;
    }
    console.log(`[recording:${recordingId}] ffmpeg process closed with code ${code}`);
  });

  return { outputPath };
}

export async function stopServerRecording(recordingId: string): Promise<{ outputPath: string }> {
  let session = activeSessions.get(recordingId);
  if (!session && restartLocks.has(recordingId)) {
    const waitUntil = Date.now() + Math.min(recordingStopTimeoutMs, 10000);
    while (!session && Date.now() < waitUntil) {
      // If restart is currently rebuilding this session, wait briefly.
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 200));
      session = activeSessions.get(recordingId);
    }
  }
  if (!session) throw new Error(`No session for ${recordingId}`);
  activeSessions.delete(recordingId);

  const { ffmpegProcess, outputPath, allocatedPorts, keyframeTimer, segments, streams } = session;
  if (keyframeTimer) clearInterval(keyframeTimer);

  // Pause consumers before requesting ffmpeg stop to reduce in-flight jitter bursts.
  for (const st of streams) {
    try {
      await st.consumer.pause();
    } catch {
      // Ignore pause failures during teardown.
    }
  }
  await new Promise((r) => setTimeout(r, 250));

  // Let ffmpeg drain queued packets after inputs are paused so we keep as much
  // of the live-call tail as possible before sending quit.
  const drainDeadline = Date.now() + Math.min(8000, Math.max(1000, recordingStopTimeoutMs - 2000));
  let lastProgressSec = session.latestEncodedTimeSec;
  let progressIdleMs = 0;
  while (!session.ffmpegExited && Date.now() < drainDeadline) {
    await new Promise((r) => setTimeout(r, 250));
    if (session.latestEncodedTimeSec > lastProgressSec + 0.01) {
      lastProgressSec = session.latestEncodedTimeSec;
      progressIdleMs = 0;
      continue;
    }
    progressIdleMs += 250;
    if (progressIdleMs >= 1250) break;
  }

  const wallElapsedSec = Math.max(0, (Date.now() - session.startedAtMs) / 1000);
  const lagSec = Math.max(0, wallElapsedSec - session.latestEncodedTimeSec);
  if (lagSec > 1) {
    console.warn(`[recording:${recordingId}] ffmpeg stop lag`, {
      wallElapsedSec: Number(wallElapsedSec.toFixed(2)),
      encodedSec: Number(session.latestEncodedTimeSec.toFixed(2)),
      lagSec: Number(lagSec.toFixed(2)),
    });
  }

  await shutdownFfmpegProcess({
    session,
    ffmpegProcess,
    recordingId,
    context: "stop",
  });

  for (const st of streams) {
    stopKeyframeTimer(st.consumer.id);
    try { st.consumer.close(); } catch { }
    try { st.transport.close(); } catch { }
  }
  releasePorts(allocatedPorts);

  if (session.segments.length > 1) {
    const finalOutputPath = path.join(path.dirname(outputPath), "raw.mp4");
    const usableSegments = session.segments.filter((segmentPath) =>
      isUsableRecordingFile(segmentPath),
    );
    if (usableSegments.length === 0) {
      throw new Error(`No usable segment files found for recordingId=${recordingId}`);
    }

    const playableSegments: string[] = [];
    for (const segmentPath of usableSegments) {
      // eslint-disable-next-line no-await-in-loop
      if (await isPlayableRecordingFile(segmentPath)) {
        playableSegments.push(segmentPath);
        continue;
      }

      // If ffprobe marks a segment invalid, attempt a quick repair so we do not
      // lose that entire interval during merge.
      // eslint-disable-next-line no-await-in-loop
      const repairedPath = await repairNonPlayableSegment(segmentPath, recordingId);
      if (repairedPath) playableSegments.push(repairedPath);
    }
    if (playableSegments.length === 0) {
      throw new Error(`No playable segment files found for recordingId=${recordingId}`);
    }
    if (playableSegments.length !== usableSegments.length) {
      console.warn("[recording:server] excluding non-playable segments before merge", {
        recordingId,
        usableCount: usableSegments.length,
        playableCount: playableSegments.length,
      });
    }

    if (playableSegments.length === 1) {
      const fallbackSegment = playableSegments[0];
      if (path.resolve(fallbackSegment) !== path.resolve(finalOutputPath)) {
        try {
          await fsp.copyFile(fallbackSegment, finalOutputPath);
        } catch {
          // Best-effort copy; fallback to original segment path.
        }
      }
      const resolvedFallbackPath = (await isPlayableRecordingFile(finalOutputPath))
        ? finalOutputPath
        : fallbackSegment;
      return { outputPath: resolvedFallbackPath };
    }

    const concatListPath = path.join(path.dirname(outputPath), "concat-list-server.txt");
    const concatContent = playableSegments.map(s => `file '${path.resolve(s).replaceAll("\\", "/")}'`).join("\n");
    await fsp.writeFile(concatListPath, concatContent, "utf8");
    try {
      console.log(`[recording:server] merging ${playableSegments.length} segments into ${finalOutputPath}`);
      // Re-encode audio during merge: asetpts=N/SR/TB generates sequential timestamps
      // across the segment boundary, eliminating DTS jumps. Video is stream-copied (fast).
      const ffmpeg = spawn(ffmpegBinary, [
        "-y",
        "-fflags", "+genpts+igndts",
        "-f", "concat",
        "-safe", "0",
        "-i", concatListPath,
        "-c:v", "copy",
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
      if (!(await isPlayableRecordingFile(finalOutputPath))) {
        throw new Error(`Merged output missing or invalid: ${finalOutputPath}`);
      }
      return { outputPath: finalOutputPath };
    } catch (err: any) {
      console.error("[recording:server] merge failed, attempting fallback segment", {
        error: err?.message || String(err),
        recordingId,
      });
      const fallbackSegment = await findLatestPlayableSegment(playableSegments);
      if (!fallbackSegment) {
        throw new Error(`Merge failed and no fallback segment available for recordingId=${recordingId}`);
      }
      if (path.resolve(fallbackSegment) !== path.resolve(finalOutputPath)) {
        try {
          await fsp.copyFile(fallbackSegment, finalOutputPath);
        } catch {
          // Best-effort copy; fallback to original segment path.
        }
      }
      const resolvedFallbackPath = (await isPlayableRecordingFile(finalOutputPath))
        ? finalOutputPath
        : fallbackSegment;
      return { outputPath: resolvedFallbackPath };
    }
  }

  const finalOutputPath = path.join(path.dirname(outputPath), "raw.mp4");
  if (fs.existsSync(outputPath)) {
    await fsp.rename(outputPath, finalOutputPath).catch(async () => {
      try {
        await fsp.copyFile(outputPath, finalOutputPath);
      } catch {
        // Best-effort fallback copy.
      }
    });
  }
  if (!(await isPlayableRecordingFile(finalOutputPath))) {
    if (await isPlayableRecordingFile(outputPath)) {
      return { outputPath };
    }

    for (const candidatePath of [finalOutputPath, outputPath]) {
      if (!isUsableRecordingFile(candidatePath)) continue;

      // If FFmpeg was interrupted while finalizing the trailer, try to salvage
      // the finished segment with a quick remux/re-encode pass before failing.
      // eslint-disable-next-line no-await-in-loop
      const repairedPath = await repairNonPlayableSegment(candidatePath, recordingId);
      if (!repairedPath) continue;

      if (path.resolve(repairedPath) !== path.resolve(finalOutputPath)) {
        try {
          await fsp.copyFile(repairedPath, finalOutputPath);
        } catch {
          // Best-effort copy; downstream processors can use the repaired path.
        }
      }

      const resolvedRepairedPath = (await isPlayableRecordingFile(finalOutputPath))
        ? finalOutputPath
        : repairedPath;
      return { outputPath: resolvedRepairedPath };
    }

    const fallbackSegment = await findLatestPlayableSegment(session.segments);
    if (fallbackSegment) {
      if (path.resolve(fallbackSegment) !== path.resolve(finalOutputPath)) {
        try {
          await fsp.copyFile(fallbackSegment, finalOutputPath);
        } catch {
          // Best-effort copy; downstream processors can use the fallback path.
        }
      }
      const resolvedFallbackPath = (await isPlayableRecordingFile(finalOutputPath))
        ? finalOutputPath
        : fallbackSegment;
      return { outputPath: resolvedFallbackPath };
    }
    throw new Error(`Recording output file unusable after stop for recordingId=${recordingId}`);
  }
  return { outputPath: finalOutputPath };
}
