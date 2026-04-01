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
  const cellW = Math.floor(targetWidth / cols) & ~1;
  const cellH = Math.floor(targetHeight / rows) & ~1;

  const filterParts: string[] = [];
  const stackInputLabels: string[] = [];

  for (let i = 0; i < n; i++) {
    const idx = videoInputIndices[i];
    const label = `sv${i}`;
    const dims = videoDimensions?.get(idx - 1);
    const isPortrait = dims ? dims.height > dims.width : false;
    const chain: string[] = [`[${idx}:v]setpts=PTS-STARTPTS,fps=15`];

    if (isPortrait) {
      chain.push("transpose=1:passthrough=portrait");
    }

    chain.push(
      `scale=${cellW}:${cellH}:force_original_aspect_ratio=decrease:flags=fast_bilinear`,
      `pad=${cellW}:${cellH}:(ow-ih)/2:(oh-ih)/2:color=black`,
    );

    filterParts.push(`${chain.join(",")}[${label}]`);
    stackInputLabels.push(`[${label}]`);
  }

  if (n === 1) {
    return { filterParts, videoOutputLabel: "sv0" };
  }

  const totalCells = cols * rows;
  for (let i = n; i < totalCells; i++) {
    const label = `blk${i}`;
    filterParts.push(`color=black:s=${cellW}x${cellH}:r=1[${label}]`);
    stackInputLabels.push(`[${label}]`);
  }

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

  const videoInputIndices = originalVideoIndices.map(i => i + 1);
  const audioInputIndices = originalAudioIndices.map(i => i + 1);

  const args: string[] = [
    "-fflags", "+genpts+discardcorrupt+nobuffer",
    "-analyzeduration", "2000000",
    "-probesize", "2000000",
    "-f", "lavfi", "-i", `color=c=black:s=${targetWidth}x${targetHeight}:r=15`,
  ];

  for (const sdpPath of sdpPathsInOrder) {
    args.push(
      "-thread_queue_size", "4096",
      "-analyzeduration", "500000",
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

  const filterParts: string[] = [];
  const hasVideo = videoInputIndices.length > 0;
  let videoOutputLabel = "";
  if (hasVideo) {
    const grid = buildVideoGridFilter({
      videoInputIndices,
      targetWidth,
      targetHeight,
      videoDimensions: params.videoDimensions,
    });
    filterParts.push(...grid.filterParts);
    videoOutputLabel = grid.videoOutputLabel;
  }

  for (let i = 0; i < audioInputIndices.length; i++) {
    const idx = audioInputIndices[i];
    filterParts.push(`[${idx}:a]asetpts=PTS-STARTPTS[anorm${i}]`);
  }
  const normalizedAudioLabels = audioInputIndices.map((_, i) => `[anorm${i}]`).join("");
  filterParts.push(
    `${normalizedAudioLabels}amix=inputs=${audioInputIndices.length}:duration=longest,aresample=async=1000[aout]`
  );

  if (hasVideo) {
    filterParts.push(`[0:v][${videoOutputLabel}]overlay=shortest=0[vout_final]`);
  }

  args.push("-filter_complex", filterParts.join(";"));

  if (hasVideo) {
    args.push(
      "-map", "[vout_final]",
      "-map", "[aout]",
      "-c:v", "libvpx",
      "-b:v", "1200k",
      "-crf", "25",
      "-quality", "realtime",
      "-deadline", "realtime",
      "-cpu-used", "12",
      "-threads", "0",
      "-lag-in-frames", "0",
      "-error-resilient", "1",
      "-auto-alt-ref", "0",
      "-static-thresh", "500",
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
    
    // Wait for pending RTP buffer flush
    await new Promise((r) => setTimeout(r, 500));
    
    // Graceful shutdown during restart so WebM header is valid
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

    for (const st of streams) {
      try { st.consumer.close(); } catch { }
      try { st.transport.close(); } catch { }
    }
    releasePorts(allocatedPorts);
    activeSessions.delete(recordingId);

    // One more small gap for OS cleanup (increased to 1s)
    await new Promise((r) => setTimeout(r, 1000));

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
  const outputPath = path.join(sessionBaseDir, `raw_${segmentIndex}.webm`);
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
      width: (s as any).width,
      height: (s as any).height
    });
  }

  await new Promise((r) => setTimeout(r, 400));
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

  const videoDimensions = new Map<number, { width: number; height: number }>();
  for (let i = 0; i < liveStreams.length; i++) {
    if (liveStreams[i].kind === "video" && liveStreams[i].width && liveStreams[i].height) {
      videoDimensions.set(i, { width: liveStreams[i].width!, height: liveStreams[i].height! });
    }
  }

  const commonStartMicros = sharedStartMicros || Date.now() * 1000;
  
  // 1. Resume consumers first so media begins flowing to UDP ports
  await Promise.all(liveStreams.map(async (st) => {
    try {
      await st.consumer.resume();
      if (st.kind === "video") {
        await (st.consumer as any).requestKeyFrame?.().catch(() => {});
      }
    } catch { }
  }));

  // 2. Short wait for UDP buffers to populate
  await new Promise((r) => setTimeout(r, 500));

  const args = buildFfmpegArgs({ 
    outputPath, 
    videoInputIndices, 
    audioInputIndices, 
    sdpPathsInOrder, 
    targetWidth: 640, 
    targetHeight: 480, 
    videoDimensions 
  });

  const ffmpegStderrPrefix = `[recording:${recordingId}] ffmpeg`;
  const ffmpegProcess = spawn(ffmpegBinary, args, { stdio: ["pipe", "pipe", "pipe"] });
  
  ffmpegProcess.stderr.on("data", (chunk) => {
    const lines = chunk.toString().split("\n");
    for (const line of lines) {
      if (line.trim()) console.log(`${ffmpegStderrPrefix} ${line.trim()}`);
    }
  });

  // 3. Monitor for early exit (e.g. bind failure)
  let ffmpegErred = false;
  ffmpegProcess.on("error", (err) => {
    console.error(`[recording:${recordingId}] ffmpeg spawn error:`, err);
    ffmpegErred = true;
  });

  // Give it a moment to stabilize
  await new Promise((r) => setTimeout(r, 800));
  if (ffmpegProcess.exitCode !== null) {
     console.error(`[recording:${recordingId}] ffmpeg exited immediately with code ${ffmpegProcess.exitCode}`);
     throw new Error(`FFmpeg failed to start for segment ${segmentIndex}`);
  }

  // 4. Request another keyframe to ensure recording starts clean
  for (const st of liveStreams) {
    if (st.kind === "video") (st.consumer as any).requestKeyFrame?.().catch(() => {});
  }

  const keyframeTimer = setInterval(() => {
    for (const st of liveStreams) {
      if (st.kind === "video" && !st.consumer.closed) {
        (st.consumer as any).requestKeyFrame?.().catch(() => {});
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
    segments: [...existingSegments, outputPath] 
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

  const { ffmpegProcess, outputPath, allocatedPorts, keyframeTimer, segments } = session;
  if (keyframeTimer) clearInterval(keyframeTimer);
  
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

  releasePorts(allocatedPorts);

  if (session.segments.length > 1) {
    const finalOutputPath = path.join(path.dirname(outputPath), "raw.webm");
    const concatListPath = path.join(path.dirname(outputPath), "concat-list-server.txt");
    const concatContent = session.segments.map(s => `file '${path.resolve(s).replaceAll("\\", "/")}'`).join("\n");
    await fsp.writeFile(concatListPath, concatContent, "utf8");
    try {
      console.log(`[recording:server] merging ${session.segments.length} segments into ${finalOutputPath}`);
      const ffmpeg = spawn(ffmpegBinary, [
        "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", concatListPath,
        "-c", "copy",
        "-fflags", "+genpts+igndts",
        "-movflags", "+faststart",
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

  const finalOutputPath = path.join(path.dirname(outputPath), "raw.webm");
  if (fs.existsSync(outputPath)) await fsp.rename(outputPath, finalOutputPath).catch(() => { });
  return { outputPath: finalOutputPath };
}
