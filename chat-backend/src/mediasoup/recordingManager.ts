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
  outputWebmPath: string;
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

function buildFfmpegArgs(params: {
  outputWebmPath: string;
  videoInputIndex: number | null;
  filterComplex: string;
  audioCodec: string;
  videoCopy: boolean;
  sdpPathsInOrder: string[];
}) {
  const {
    outputWebmPath,
    videoInputIndex,
    filterComplex,
    audioCodec,
    videoCopy,
    sdpPathsInOrder,
  } = params;

  const args: string[] = [
    "-fflags",
    "+genpts",
    "-analyzeduration",
    "5000000",
    "-probesize",
    "5000000",
  ];

  for (const sdpPath of sdpPathsInOrder) {
    // ffmpeg's -protocol_whitelist is effectively input-scoped for certain demuxers,
    // so repeat it before each SDP input.
    args.push("-protocol_whitelist", "file,udp,rtp,rtcp");
    args.push("-i", sdpPath);
  }

  args.push("-filter_complex", filterComplex);

  if (videoInputIndex !== null) {
    args.push(
      "-map",
      `${videoInputIndex}:v`,
      "-map",
      "[aout]",
      "-c:v",
      videoCopy ? "copy" : "libvpx",
      "-c:a",
      audioCodec,
      "-b:a",
      "128k",
    );
  } else {
    // audio only
    args.push(
      "-map",
      "[aout]",
      "-c:a",
      audioCodec,
      "-b:a",
      "128k",
    );
  }

  // Output container
  args.push("-f", "webm", "-y", outputWebmPath);

  return args;
}

export function isRecordingActive(recordingId: string) {
  return activeSessions.has(recordingId);
}

export async function startServerRecording(params: {
  roomId: string;
  recordingId: string;
  isAudioOnly: boolean;
}): Promise<{ outputWebmPath: string }> {
  const { roomId, recordingId, isAudioOnly } = params;

  if (activeSessions.has(recordingId)) {
    throw new Error(`Recording session already active for recordingId=${recordingId}`);
  }

  ensureDir(recordingConfig.tempUploadDir);

  const sessionBaseDir = path.join(recordingConfig.tempUploadDir, recordingId);
  const sdpDir = path.join(sessionBaseDir, "sdp");
  ensureDir(sessionBaseDir);
  ensureDir(sdpDir);

  const outputWebmPath = path.join(sessionBaseDir, "raw.webm");

  // Clean existing output to avoid ffmpeg appending/reading stale files.
  if (fs.existsSync(outputWebmPath)) fs.unlinkSync(outputWebmPath);

  const room = await getOrCreateRoom(roomId);
  const producers = getRoomProducers(roomId);

  const audioProducers = producers.filter((p) => p.kind === "audio");
  const videoProducers = producers.filter((p) => p.kind === "video");

  const selectedVideoProducer = !isAudioOnly ? videoProducers[0] : undefined;

  const selectedAudioProducers = audioProducers;
  if (selectedAudioProducers.length === 0 && !selectedVideoProducer) {
    throw new Error("No audio/video producers found for server-side recording.");
  }

  const sdpIp = getLocalIp();

  const streams: ServerStream[] = [];

  // Consume each selected producer and send its RTP to a dedicated localhost port for FFmpeg.
  const selectedStreams: { producerId: string; kind: types.MediaKind }[] = [
    ...(selectedVideoProducer ? [{ producerId: selectedVideoProducer.producerId, kind: "video" as const }] : []),
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

  // Build filter_complex: mix all audio inputs into [aout]
  const videoInputIndex = streams[0]?.kind === "video" ? 0 : null;

  const sdpPathsInOrder = streams.map((st) => st.sdpPath);
  const audioInputIndices: number[] = [];
  for (let i = 0; i < streams.length; i++) {
    if (streams[i].kind === "audio") audioInputIndices.push(i);
  }

  // We always require at least one audio for this phase (audio mixing in phase 1).
  // If the session is video-only, we still need audio to define [aout].
  if (audioInputIndices.length === 0) {
    throw new Error("Server-side recording currently requires at least one audio producer.");
  }

  const audioLabels = audioInputIndices.map((i) => `[${i}:a]`).join("");
  const filterComplex = `${audioLabels}amix=inputs=${audioInputIndices.length}:duration=longest[aout]`;

  const args = buildFfmpegArgs({
    outputWebmPath,
    videoInputIndex,
    filterComplex,
    audioCodec: "libopus",
    videoCopy: true,
    sdpPathsInOrder,
  });

  const ffmpegStderrPrefix = `[recording:${recordingId}] ffmpeg`;
  console.log("[recording:server] spawn ffmpeg", {
    recordingId,
    roomId,
    outputWebmPath,
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
        (st.consumer as any).requestKeyFrame?.();
      } catch {
        // ignore
      }
    }
  }, 2000);

  const allocatedPorts = streams.flatMap((st) => [st.rtpPort, st.rtcpPort]);

  const session: RecordingSession = {
    roomId,
    recordingId,
    outputWebmPath,
    sdpDir,
    ffmpegProcess,
    ffmpegStderrPrefix,
    streams,
    allocatedPorts,
    keyframeTimer,
  };

  activeSessions.set(recordingId, session);

  return { outputWebmPath };
}

export async function stopServerRecording(recordingId: string): Promise<{ outputWebmPath: string }> {
  const session = activeSessions.get(recordingId);
  if (!session) {
    throw new Error(`No active server-side recording session for recordingId=${recordingId}`);
  }

  activeSessions.delete(recordingId);

  const { ffmpegProcess, streams, outputWebmPath, allocatedPorts, keyframeTimer } = session;

  if (keyframeTimer) {
    clearInterval(keyframeTimer);
  }

  // Graceful stop for ffmpeg.
  // ffmpeg listens for commands on stdin; `q` should stop and write trailer.
  try {
    ffmpegProcess.stdin?.write("q\n");
  } catch {
    // ignore
  }

  // Ensure stdin closes so ffmpeg can exit even if q doesn't work.
  // Give ffmpeg a moment to process the quit command before ending stdin.
  const exitCode: number | null = await new Promise((resolve) => {
    let resolved = false;
    const onClose = (code: number | null) => {
      if (resolved) return;
      resolved = true;
      resolve(code);
    };
    ffmpegProcess.once("close", onClose);
    // Fallback timeout (Windows may need more time to flush container trailers)
    setTimeout(() => {
      try {
        // Prefer SIGTERM first; then SIGKILL only if needed.
        ffmpegProcess.kill("SIGTERM");
      } catch {
        // ignore
      }
      setTimeout(() => {
        try {
          ffmpegProcess.kill("SIGKILL");
        } catch {
          // ignore
        }
        onClose(null);
      }, 8000);
    }, 45000);
  });

  console.log("[recording:server] ffmpeg stopped", { recordingId, exitCode });

  // Ensure stdin is closed after sending quit.
  try {
    ffmpegProcess.stdin?.end();
  } catch {
    // ignore
  }

  // Close mediasoup consumer/transport.
  for (const st of streams) {
    try {
      st.consumer.close();
    } catch {
      // ignore
    }
    try {
      st.transport.close();
    } catch {
      // ignore
    }
  }

  releasePorts(allocatedPorts);

  // Keep SDP files for debugging; cleanup can be added later.
  return { outputWebmPath };
}

