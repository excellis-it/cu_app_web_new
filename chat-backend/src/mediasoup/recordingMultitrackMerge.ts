/**
 * Offline merge of per-producer track files into one composite MP4 (grid + mixed audio).
 * Used after multitrack server recording stops — avoids FFmpeg restart gaps when users join mid-call.
 */
import { spawn } from "child_process";
import fsp from "fs/promises";
import path from "path";

export type MergeRecordingScope = "call" | "screen";

const ffmpegBinary = process.env.FFMPEG_PATH || "ffmpeg";

export type MultitrackManifestTrack = {
  producerId: string;
  kind: "audio" | "video";
  path: string;
  /** Seconds after session start when this track began recording */
  delaySec: number;
  /** Seconds after session start when producer closed (optional; else session end) */
  endSec?: number;
  width?: number;
  height?: number;
  rotation?: number;
  source?: string;
  portraitLock?: boolean;
  hasVideoOrientationExtmap?: boolean;
};

export type MultitrackManifest = {
  version: 1;
  sessionStartedWallMs: number;
  stoppedWallMs: number;
  totalDurationSec: number;
  recordingScope: MergeRecordingScope;
  tracks: MultitrackManifestTrack[];
};

function computeCanvasSize(
  videoCount: number,
  recordingScope: MergeRecordingScope,
  capW: number,
  capH: number,
): { width: number; height: number } {
  if (videoCount >= 5) {
    return { width: Math.min(capW, 480), height: Math.min(capH, 270) };
  }
  if (videoCount >= 3) {
    return { width: Math.min(capW, 640), height: Math.min(capH, 360) };
  }
  return { width: capW, height: capH };
}

function buildMergeVideoBranch(
  idx: number,
  cellW: number,
  cellH: number,
  label: string,
  dims: MultitrackManifestTrack | undefined,
  streamIndexForLog: number,
  fps: number,
  applyHalfTurnRotation: boolean,
): string {
  if (!dims || dims.kind !== "video") {
    return `[${idx}:v]setpts=PTS-STARTPTS,fps=${fps},scale=${cellW}:${cellH}:force_original_aspect_ratio=decrease:flags=fast_bilinear,pad=${cellW}:${cellH}:(ow-iw)/2:(oh-ih)/2:color=black[${label}]`;
  }
  const streamHasVideoOrientationExtmap = !!dims.hasVideoOrientationExtmap;
  const normalizedRotation = (() => {
    if (typeof dims.rotation !== "number") return 0;
    const r = ((dims.rotation % 360) + 360) % 360;
    if (r === 90 || r === 180 || r === 270) return r;
    return 0;
  })();
  const hasExplicitRotation = normalizedRotation !== 0;
  const isFlutterPortraitLocked =
    String(dims.source || "").toLowerCase() === "flutter-app" &&
    dims.portraitLock === true;
  const effectiveWidth =
    normalizedRotation % 180 !== 0 ? dims.height : dims.width;
  const effectiveHeight =
    normalizedRotation % 180 !== 0 ? dims.width : dims.height;
  const isPortrait = !!(
    effectiveWidth &&
    effectiveHeight &&
    effectiveHeight > effectiveWidth
  );
  const isLandscape = !!(
    effectiveWidth &&
    effectiveHeight &&
    effectiveWidth >= effectiveHeight
  );

  const chain: string[] = [`[${idx}:v]setpts=PTS-STARTPTS,fps=${fps}`];
  if (streamHasVideoOrientationExtmap && hasExplicitRotation) {
    console.log("[recording:merge:orientation] honoring appData.rotation", {
      streamIndex: streamIndexForLog,
      appRotation: normalizedRotation,
    });
  }
  if (normalizedRotation === 90) {
    chain.push("transpose=1");
  } else if (normalizedRotation === 270) {
    chain.push("transpose=2:passthrough=portrait");
  } else if (normalizedRotation === 180) {
    if (applyHalfTurnRotation) {
      chain.push("hflip,vflip");
    }
  } else if (isFlutterPortraitLocked && isLandscape) {
    chain.push("transpose=1:passthrough=portrait");
  } else if (!streamHasVideoOrientationExtmap && !hasExplicitRotation && isPortrait) {
    chain.push("transpose=2:passthrough=portrait");
  }
  chain.push(
    `scale=${cellW}:${cellH}:force_original_aspect_ratio=decrease:flags=fast_bilinear`,
    `pad=${cellW}:${cellH}:(ow-iw)/2:(oh-ih)/2:color=black`,
  );
  return `${chain.join(",")}[${label}]`;
}

function buildGridOverlayChain(params: {
  videoInputIndices: number[];
  targetWidth: number;
  targetHeight: number;
  tracks: MultitrackManifestTrack[];
  baseInputIdx: number;
  fps: number;
  totalDurationSec: number;
  applyHalfTurnRotation: boolean;
}): { filterParts: string[]; videoOutLabel: string } {
  const {
    videoInputIndices,
    targetWidth,
    targetHeight,
    tracks,
    baseInputIdx,
    fps,
    totalDurationSec,
    applyHalfTurnRotation,
  } = params;
  const n = videoInputIndices.length;
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const cellW = Math.floor(targetWidth / cols) & ~1;
  const cellH = Math.floor(targetHeight / rows) & ~1;

  const filterParts: string[] = [];
  let currentBase = `${baseInputIdx}:v`;

  for (let i = 0; i < n; i++) {
    const idx = videoInputIndices[i];
    const tr = tracks[i];
    const delay = Math.max(0, tr.delaySec);
    const end = Math.min(
      totalDurationSec,
      tr.endSec ?? totalDurationSec,
    );
    const label = `sv${i}`;
    filterParts.push(
      buildMergeVideoBranch(
        idx,
        cellW,
        cellH,
        label,
        tr,
        i,
        fps,
        applyHalfTurnRotation,
      ),
    );
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * cellW;
    const y = row * cellH;
    const nextBase = `ovl${i}`;
    const enable = `between(t\\,${delay}\\,${end})`;
    filterParts.push(
      `[${currentBase}][${label}]overlay=x=${x}:y=${y}:eof_action=pass:repeatlast=1:enable='${enable}'[${nextBase}]`,
    );
    currentBase = nextBase;
  }

  return { filterParts, videoOutLabel: currentBase };
}

export async function mergeMultitrackManifestToMp4(params: {
  manifest: MultitrackManifest;
  outputPath: string;
  recordingId: string;
  fps: number;
  canvasWidth: number;
  canvasHeight: number;
  screenCanvasWidth: number;
  screenCanvasHeight: number;
  libx264Threads: number;
  applyHalfTurnRotation: boolean;
}): Promise<void> {
  const {
    manifest,
    outputPath,
    recordingId,
    fps,
    canvasWidth,
    canvasHeight,
    screenCanvasWidth,
    screenCanvasHeight,
    libx264Threads,
    applyHalfTurnRotation,
  } = params;

  const T = Math.max(0.5, manifest.totalDurationSec);
  const videoTracks = manifest.tracks
    .filter((t) => t.kind === "video")
    .sort((a, b) => a.producerId.localeCompare(b.producerId));
  const audioTracks = manifest.tracks
    .filter((t) => t.kind === "audio")
    .sort((a, b) => a.producerId.localeCompare(b.producerId));

  for (const t of [...videoTracks, ...audioTracks]) {
    try {
      await fsp.access(t.path);
    } catch {
      throw new Error(`Multitrack merge: missing track file ${t.path}`);
    }
  }

  const capW =
    manifest.recordingScope === "screen" ? screenCanvasWidth : canvasWidth;
  const capH =
    manifest.recordingScope === "screen" ? screenCanvasHeight : canvasHeight;
  const { width: targetWidth, height: targetHeight } = computeCanvasSize(
    videoTracks.length,
    manifest.recordingScope,
    capW,
    capH,
  );

  const args: string[] = ["-y", "-fflags", "+genpts+igndts"];

  let inputIdx = 0;
  const videoIndices: number[] = [];
  for (const t of videoTracks) {
    args.push("-i", path.resolve(t.path));
    videoIndices.push(inputIdx);
    inputIdx++;
  }
  const audioIndices: number[] = [];
  for (const t of audioTracks) {
    args.push("-i", path.resolve(t.path));
    audioIndices.push(inputIdx);
    inputIdx++;
  }

  const hasVideo = videoTracks.length > 0;
  const hasAudio = audioTracks.length > 0;

  if (hasVideo) {
    const baseIdx = inputIdx;
    args.push(
      "-f",
      "lavfi",
      "-i",
      `color=c=black:s=${targetWidth}x${targetHeight}:d=${T}:r=${fps}`,
    );

    const { filterParts, videoOutLabel } = buildGridOverlayChain({
      videoInputIndices: videoIndices,
      targetWidth,
      targetHeight,
      tracks: videoTracks,
      baseInputIdx: baseIdx,
      fps,
      totalDurationSec: T,
      applyHalfTurnRotation,
    });

    const fc: string[] = [...filterParts];

    const targetSamples = Math.max(1, Math.ceil(T * 48000 * 2));
    const aformat =
      "aformat=sample_rates=48000:sample_fmts=fltp:channel_layouts=stereo";

    if (hasAudio) {
      for (let i = 0; i < audioIndices.length; i++) {
        const ai = audioIndices[i];
        const tr = audioTracks[i];
        const delayMs = Math.max(0, Math.round(tr.delaySec * 1000));
        fc.push(
          `[${ai}:a]asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs},aresample=async=1000:min_hard_comp=0.100,${aformat}[a_r${i}]`,
        );
      }
      const mixIn = audioTracks.map((_, i) => `[a_r${i}]`).join("");
      fc.push(
        `${mixIn}amix=inputs=${audioTracks.length}:duration=longest:dropout_transition=3:normalize=0[a_mix];[a_mix]apad=whole_len=${targetSamples},${aformat},asetpts=N/SR/TB[aout]`,
      );
    } else {
      args.push(
        "-f",
        "lavfi",
        "-i",
        `anullsrc=channel_layout=stereo:sample_rate=48000:d=${T}`,
      );
      const silentIdx = baseIdx + 1;
      fc.push(
        `[${silentIdx}:a]asetpts=PTS-STARTPTS,${aformat},asetpts=N/SR/TB[aout]`,
      );
    }

    args.push("-filter_complex", fc.join(";"));
    args.push(
      "-map",
      `[${videoOutLabel}]`,
      "-map",
      "[aout]",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-r",
      String(fps),
      "-g",
      String(fps * 2),
      "-bf",
      "0",
      "-threads",
      libx264Threads > 0 ? String(libx264Threads) : "0",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-t",
      String(T),
      "-movflags",
      "+faststart",
      "-max_muxing_queue_size",
      "4096",
      path.resolve(outputPath),
    );
  } else if (hasAudio) {
    const fc: string[] = [];
    const targetSamples = Math.max(1, Math.ceil(T * 48000 * 2));
    const aformat =
      "aformat=sample_rates=48000:sample_fmts=fltp:channel_layouts=stereo";
    for (let i = 0; i < audioIndices.length; i++) {
      const ai = audioIndices[i];
      const tr = audioTracks[i];
      const delayMs = Math.max(0, Math.round(tr.delaySec * 1000));
      fc.push(
        `[${ai}:a]asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs},aresample=async=1000:min_hard_comp=0.100,${aformat}[a_r${i}]`,
      );
    }
    const mixIn = audioTracks.map((_, i) => `[a_r${i}]`).join("");
    fc.push(
      `${mixIn}amix=inputs=${audioTracks.length}:duration=longest:dropout_transition=3:normalize=0[a_mix];[a_mix]apad=whole_len=${targetSamples},${aformat},asetpts=N/SR/TB[aout]`,
    );
    args.push("-filter_complex", fc.join(";"));
    args.push(
      "-map",
      "[aout]",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-t",
      String(T),
      "-movflags",
      "+faststart",
      path.resolve(outputPath),
    );
  } else {
    throw new Error("Multitrack merge: no audio or video tracks");
  }

  console.log(`[recording:merge:multitrack] ${recordingId} ffmpeg`, {
    videoTracks: videoTracks.length,
    audioTracks: audioTracks.length,
    T,
    targetWidth,
    targetHeight,
  });

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegBinary, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr?.on("data", (c) => {
      stderr += c.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code: number | null) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `Multitrack merge ffmpeg failed code=${code} stderr=${stderr.slice(-2500)}`,
          ),
        );
    });
  });
}
