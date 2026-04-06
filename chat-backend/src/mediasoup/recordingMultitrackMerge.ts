/**
 * Offline merge of per-producer track files into one composite MP4 (grid + mixed audio).
 * Used after multitrack server recording stops — avoids FFmpeg restart gaps when users join mid-call.
 */
import { spawn } from "child_process";
import fsp from "fs/promises";
import path from "path";

import {
  getRecordingFlutterPortraitTranspose,
  getRecordingGridCellFit,
} from "../helpers/recordingConfig";

export type MergeRecordingScope = "call" | "screen";

const ffmpegBinary = process.env.FFMPEG_PATH || "ffmpeg";
const ffprobeBinary = ffmpegBinary.replace(/ffmpeg(\.exe)?$/, "ffprobe$1");

async function probeStreamDurationSec(filePath: string): Promise<number> {
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
    proc.stdout.on("data", (c) => {
      stdout += c.toString();
    });
    proc.on("error", () => resolve(0));
    proc.on("close", (code) => {
      if (code !== 0) {
        resolve(0);
        return;
      }
      const d = Number.parseFloat(String(stdout).trim());
      resolve(Number.isFinite(d) && d > 0 ? d : 0);
    });
  });
}

/** Probe actual video frame width×height and rotation metadata from a recorded .mp4 track file. */
async function probeVideoFrameInfo(
  filePath: string,
): Promise<{ width: number; height: number; rotation: number } | null> {
  return new Promise((resolve) => {
    const proc = spawn(
      ffprobeBinary,
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height:stream_tags=rotate:side_data=rotation",
        "-of",
        "json",
        path.resolve(filePath),
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    proc.stdout.on("data", (c) => {
      stdout += c.toString();
    });
    proc.on("error", () => resolve(null));
    proc.on("close", (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }
      try {
        const info = JSON.parse(stdout);
        const stream = info?.streams?.[0];
        if (!stream) {
          resolve(null);
          return;
        }
        const w = Number(stream.width);
        const h = Number(stream.height);
        if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
          resolve(null);
          return;
        }
        // Check rotation from tags or side_data
        let rotation = 0;
        if (stream.tags?.rotate) {
          rotation = Number(stream.tags.rotate) || 0;
        } else if (stream.side_data_list) {
          for (const sd of stream.side_data_list) {
            if (sd.rotation !== undefined) {
              rotation = Number(sd.rotation) || 0;
              break;
            }
          }
        }
        // Normalize rotation to 0/90/180/270
        rotation = ((Math.round(rotation) % 360) + 360) % 360;
        resolve({ width: w, height: h, rotation });
      } catch {
        resolve(null);
      }
    });
  });
}

export type MultitrackManifestTrack = {
  producerId: string;
  kind: "audio" | "video";
  path: string;
  /** Seconds after session start when this track began recording */
  delaySec: number;
  /** Seconds after session start when producer closed (optional; else session end) */
  endSec?: number;
  /** Mediasoup peer id (set at finalize) — used to merge one tile per participant in call recordings */
  userId?: string;
  width?: number;
  height?: number;
  rotation?: number;
  source?: string;
  portraitLock?: boolean;
  /** Client platform: 'ios', 'android', 'web', etc. */
  platform?: string;
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

const mergeGridCellFit = getRecordingGridCellFit();

/** One row per unique producer id (keep longest probed track if duplicates). */
function dedupeVideoTracksByProducerId(
  tracks: MultitrackManifestTrack[],
  durationsSec: number[],
): { tracks: MultitrackManifestTrack[]; durationsSec: number[] } {
  const best = new Map<
    string,
    { t: MultitrackManifestTrack; d: number; order: number }
  >();
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    const d = durationsSec[i] ?? 0;
    const prev = best.get(t.producerId);
    if (!prev) {
      best.set(t.producerId, { t, d, order: i });
    } else if (d > prev.d) {
      best.set(t.producerId, { t, d, order: prev.order });
    }
  }
  const rows = [...best.values()].sort((a, b) => a.order - b.order);
  return {
    tracks: rows.map((r) => r.t),
    durationsSec: rows.map((r) => r.d),
  };
}

/**
 * Call recordings: one video cell per participant (longest track wins if the same user had multiple producers).
 * Without userId (legacy manifests), each producer stays separate so behavior matches older files.
 */
function collapseCallVideosToOnePerParticipant(
  tracks: MultitrackManifestTrack[],
  durationsSec: number[],
): { tracks: MultitrackManifestTrack[]; durationsSec: number[] } {
  const hasAnyUser = tracks.some(
    (t) => t.userId != null && String(t.userId).length > 0,
  );
  if (!hasAnyUser) {
    return { tracks, durationsSec };
  }
  const best = new Map<
    string,
    { t: MultitrackManifestTrack; d: number; order: number }
  >();
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    const d = durationsSec[i] ?? 0;
    const key =
      t.userId != null && String(t.userId).length > 0
        ? `u:${String(t.userId)}`
        : `p:${t.producerId}`;
    const prev = best.get(key);
    if (!prev) {
      best.set(key, { t, d, order: i });
    } else if (d > prev.d) {
      best.set(key, { t, d, order: prev.order });
    }
  }
  const rows = [...best.values()].sort((a, b) => a.order - b.order);
  return {
    tracks: rows.map((r) => r.t),
    durationsSec: rows.map((r) => r.d),
  };
}

/** Scale each grid cell: "cover" fills (center crop); "contain" letterboxes (matches calmer live preview). */
function ffScaleCellToBox(
  cellW: number,
  cellH: number,
  fit: "cover" | "contain",
): string[] {
  if (fit === "contain") {
    return [
      `scale=${cellW}:${cellH}:force_original_aspect_ratio=decrease:flags=fast_bilinear`,
      `pad=${cellW}:${cellH}:(ow-iw)/2:(oh-ih)/2:color=black`,
    ];
  }
  return [
    `scale=${cellW}:${cellH}:force_original_aspect_ratio=increase:flags=fast_bilinear`,
    `crop=${cellW}:${cellH}:(iw-${cellW})/2:(ih-${cellH})/2`,
  ];
}

const STAGGERED_CALL_MIN_GAP_SEC = 1.0;

/**
 * Equal-share grid for n simultaneous call participants: 1→1×1, 2→2×1, 3→3×1, 4→2×2,
 * 5+→⌈√n⌉ columns with uniform cell size (last row may have empty cells).
 */
function computeCallEqualGridColsRows(n: number): { cols: number; rows: number } {
  if (!Number.isFinite(n) || n <= 0) return { cols: 1, rows: 1 };
  if (n === 1) return { cols: 1, rows: 1 };
  if (n === 2) return { cols: 2, rows: 1 };
  if (n === 3) return { cols: 3, rows: 1 };
  if (n === 4) return { cols: 2, rows: 2 };
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  return { cols, rows };
}

function computeAlignedVideoTiming(
  tr: MultitrackManifestTrack,
  probedDurationSec: number,
  masterDurationSec: number,
): { delay: number; windowLen: number; tailPad: number; rawDur: number; T: number } {
  const T = Math.max(0.5, masterDurationSec);
  const delay = Math.max(0, tr.delaySec);
  const endBound = Math.min(T, tr.endSec ?? T);
  const maxContent = Math.max(0, endBound - delay);
  const rawDur = Math.max(0, probedDurationSec);
  const contentWindow = Math.min(rawDur, maxContent, T - delay);
  const windowLen = Math.max(0.04, contentWindow);
  const tailPad = Math.max(0, T - delay - windowLen);
  return { delay, windowLen, tailPad, rawDur, T };
}

/** Comma-separated filters after trim/fps (transpose, etc.); empty if none. */
function buildVideoOrientationFilters(
  tr: MultitrackManifestTrack,
  streamIndexForLog: number,
  applyHalfTurnRotation: boolean,
): string {
  if (tr.kind !== "video") return "";

  const streamHasVideoOrientationExtmap = !!tr.hasVideoOrientationExtmap;
  const normalizedRotation = (() => {
    if (typeof tr.rotation !== "number") return 0;
    const r = ((tr.rotation % 360) + 360) % 360;
    if (r === 90 || r === 180 || r === 270) return r;
    return 0;
  })();
  const hasExplicitRotation = normalizedRotation !== 0;
  const isFlutterPortraitLocked =
    String(tr.source || "").toLowerCase() === "flutter-app" &&
    tr.portraitLock === true;
  const isIOS = String(tr.platform || "").toLowerCase() === "ios";
  const effectiveWidth =
    normalizedRotation % 180 !== 0 ? tr.height : tr.width;
  const effectiveHeight =
    normalizedRotation % 180 !== 0 ? tr.width : tr.height;
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

  const parts: string[] = [];
  if (streamHasVideoOrientationExtmap && hasExplicitRotation) {
    console.log("[recording:merge:orientation] honoring appData.rotation", {
      streamIndex: streamIndexForLog,
      appRotation: normalizedRotation,
    });
  }
  if (normalizedRotation === 90) {
    parts.push("transpose=1");
  } else if (normalizedRotation === 270) {
    parts.push("transpose=2:passthrough=portrait");
  } else if (normalizedRotation === 180) {
    if (applyHalfTurnRotation) {
      parts.push("hflip,vflip");
    }
  } else if (isFlutterPortraitLocked && isLandscape) {
    // iOS front camera produces frames flipped 180° relative to Android.
    // Apply hflip,vflip first, then transpose to portrait orientation.
    const ft = getRecordingFlutterPortraitTranspose();
    if (isIOS) {
      parts.push(`hflip,vflip,transpose=${ft}:passthrough=portrait`);
      console.log("[recording:merge:orientation] iOS flutter portrait-lock: applied 180° flip + transpose", {
        streamIndex: streamIndexForLog,
        transpose: ft,
        platform: tr.platform,
        width: effectiveWidth,
        height: effectiveHeight,
      });
    } else {
      parts.push(`transpose=${ft}:passthrough=portrait`);
    }
  } else if (
    !streamHasVideoOrientationExtmap &&
    !hasExplicitRotation &&
    isPortrait
  ) {
    parts.push("transpose=2:passthrough=portrait");
  }
  return parts.join(",");
}

/** Call recordings: sort video tracks by join delay (stable) so layout matches join order. */
function sortCallVideosByDelayAsc(
  tracks: MultitrackManifestTrack[],
  durationsSec: number[],
): { tracks: MultitrackManifestTrack[]; durationsSec: number[] } {
  const n = tracks.length;
  if (n <= 1) return { tracks, durationsSec };
  const order = [...Array(n).keys()].sort((a, b) => {
    const da = Math.max(0, tracks[a].delaySec);
    const db = Math.max(0, tracks[b].delaySec);
    return da - db || a - b;
  });
  return {
    tracks: order.map((i) => tracks[i]),
    durationsSec: order.map((i) => durationsSec[i]),
  };
}

function shouldStaggerCallTwoVideoLayout(
  tracks: MultitrackManifestTrack[],
  totalDurationSec: number,
): boolean {
  if (tracks.length !== 2) return false;
  const d0 = Math.max(0, tracks[0].delaySec);
  const d1 = Math.max(0, tracks[1].delaySec);
  const dLo = Math.min(d0, d1);
  const dHi = Math.max(d0, d1);
  const T = Math.max(0.5, totalDurationSec);
  return (
    dHi - dLo >= STAGGERED_CALL_MIN_GAP_SEC && dHi < T - 0.05
  );
}

/**
 * Time-varying equal layout: while k+1 participants are present, split canvas as 100/(k+1) per tile.
 * Tracks must be sorted by delaySec ascending; segment s uses [d[s], d[s+1]) with d[n]=T.
 */
function buildDynamicEqualCallLayoutChain(params: {
  videoInputIndices: number[];
  targetWidth: number;
  targetHeight: number;
  tracks: MultitrackManifestTrack[];
  videoProbedDurationsSec: number[];
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
    videoProbedDurationsSec,
    baseInputIdx,
    fps,
    totalDurationSec,
    applyHalfTurnRotation,
  } = params;

  const n = tracks.length;
  const T = Math.max(0.5, totalDurationSec);
  const d = tracks.map((t) => Math.max(0, t.delaySec));
  const filterParts: string[] = [];
  let cur = `${baseInputIdx}:v`;
  let overlayCounter = 0;

  for (let s = 0; s < n; s++) {
    const segStart = d[s];
    const segEnd = s + 1 < n ? d[s + 1] : T;
    if (segEnd - segStart < 0.02) continue;

    const activeCount = s + 1;
    const { cols, rows } = computeCallEqualGridColsRows(activeCount);
    const cellW = Math.floor(targetWidth / cols) & ~1;
    const cellH = Math.floor(targetHeight / rows) & ~1;

    for (let j = 0; j <= s; j++) {
      const col = j % cols;
      const row = Math.floor(j / cols);
      const x = col * cellW;
      const y = row * cellH;
      const label = `dy_s${s}_j${j}`;
      filterParts.push(
        buildAlignedMergeVideoBranch({
          idx: videoInputIndices[j],
          cellW,
          cellH,
          label,
          tr: tracks[j],
          streamIndexForLog: j,
          fps,
          applyHalfTurnRotation,
          probedDurationSec: videoProbedDurationsSec[j] ?? 0,
          masterDurationSec: T,
        }),
      );
      const next = `dy_out${overlayCounter++}`;
      const ss = segStart.toFixed(3);
      const se = segEnd.toFixed(3);
      filterParts.push(
        `[${cur}][${label}]overlay=x=${x}:y=${y}:enable='between(t,${ss},${se})':eof_action=pass:repeatlast=1[${next}]`,
      );
      cur = next;
    }
  }

  console.log("[recording:merge:layout] dynamic equal call layout", {
    participants: n,
    delaysSec: d.map((v) => Number(v.toFixed(3))),
    masterSec: T,
  });

  return { filterParts, videoOutLabel: cur };
}

/**
 * Build one grid cell: trim file content to the active window, scale/crop, then
 * tpad black before delay and clone-pad after so PTS matches the master canvas (0…T).
 * Without this, overlay enable=between(t,delay,end) never sees late-joiner frames because
 * their stream PTS still starts at 0 while output time t is already past delay.
 */
function buildAlignedMergeVideoBranch(params: {
  idx: number;
  cellW: number;
  cellH: number;
  label: string;
  tr: MultitrackManifestTrack;
  streamIndexForLog: number;
  fps: number;
  applyHalfTurnRotation: boolean;
  probedDurationSec: number;
  masterDurationSec: number;
}): string {
  const {
    idx,
    cellW,
    cellH,
    label,
    tr,
    streamIndexForLog,
    fps,
    applyHalfTurnRotation,
    probedDurationSec,
    masterDurationSec,
  } = params;

  const { delay, windowLen, tailPad, rawDur, T } = computeAlignedVideoTiming(
    tr,
    probedDurationSec,
    masterDurationSec,
  );
  const wl = windowLen.toFixed(4);

  if (tr.kind !== "video") {
    const [sc, cr] = ffScaleCellToBox(cellW, cellH, mergeGridCellFit);
    return `[${idx}:v]setpts=PTS-STARTPTS,trim=start=0:duration=${wl},fps=${fps},${sc},${cr},tpad=start_duration=${delay.toFixed(4)}:start_mode=add:color=black,tpad=stop_mode=clone:stop_duration=${tailPad.toFixed(4)}[${label}]`;
  }

  const orient = buildVideoOrientationFilters(
    tr,
    streamIndexForLog,
    applyHalfTurnRotation,
  );
  const chain = [
    `[${idx}:v]setpts=PTS-STARTPTS,trim=start=0:duration=${wl},fps=${fps}`,
    orient,
    ...ffScaleCellToBox(cellW, cellH, mergeGridCellFit),
    `tpad=start_duration=${delay.toFixed(4)}:start_mode=add:color=black`,
    `tpad=stop_mode=clone:stop_duration=${tailPad.toFixed(4)}`,
  ]
    .filter(Boolean)
    .join(",");
  console.log("[recording:merge:align] video track timeline", {
    streamIndex: streamIndexForLog,
    producerId: tr.producerId,
    delaySec: delay,
    windowLenSec: Number(windowLen.toFixed(3)),
    tailPadSec: Number(tailPad.toFixed(3)),
    masterT: T,
    probedSec: rawDur,
  });
  return `${chain}[${label}]`;
}

function buildGridOverlayChain(params: {
  videoInputIndices: number[];
  targetWidth: number;
  targetHeight: number;
  tracks: MultitrackManifestTrack[];
  videoProbedDurationsSec: number[];
  baseInputIdx: number;
  fps: number;
  totalDurationSec: number;
  applyHalfTurnRotation: boolean;
  recordingScope: MergeRecordingScope;
}): { filterParts: string[]; videoOutLabel: string } {
  const {
    videoInputIndices,
    targetWidth,
    targetHeight,
    tracks,
    videoProbedDurationsSec,
    baseInputIdx,
    fps,
    totalDurationSec,
    applyHalfTurnRotation,
    recordingScope,
  } = params;
  const n = videoInputIndices.length;
  let cols: number;
  let rows: number;
  if (recordingScope === "call") {
    const g = computeCallEqualGridColsRows(n);
    cols = g.cols;
    rows = g.rows;
  } else {
    cols = Math.ceil(Math.sqrt(n));
    rows = Math.ceil(n / cols);
  }
  const cellW = Math.floor(targetWidth / cols) & ~1;
  const cellH = Math.floor(targetHeight / rows) & ~1;

  const filterParts: string[] = [];
  let currentBase = `${baseInputIdx}:v`;

  for (let i = 0; i < n; i++) {
    const idx = videoInputIndices[i];
    const tr = tracks[i];
    const label = `sv${i}`;
    const probed = videoProbedDurationsSec[i] ?? 0;
    filterParts.push(
      buildAlignedMergeVideoBranch({
        idx,
        cellW,
        cellH,
        label,
        tr,
        streamIndexForLog: i,
        fps,
        applyHalfTurnRotation,
        probedDurationSec: probed,
        masterDurationSec: totalDurationSec,
      }),
    );
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * cellW;
    const y = row * cellH;
    const nextBase = `ovl${i}`;
    filterParts.push(
      `[${currentBase}][${label}]overlay=x=${x}:y=${y}:eof_action=pass:repeatlast=1[${nextBase}]`,
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
  // Preserve manifest order (multitrack session insertion order). Sorting by producerId
  // previously reordered tiles vs live view (e.g. web left / mobile right became swapped).
  let videoTracks = manifest.tracks.filter((t) => t.kind === "video");
  const audioTracks = manifest.tracks.filter((t) => t.kind === "audio");

  for (const t of [...videoTracks, ...audioTracks]) {
    try {
      await fsp.access(t.path);
    } catch {
      throw new Error(`Multitrack merge: missing track file ${t.path}`);
    }
  }

  let videoProbedDurationsSec = await Promise.all(
    videoTracks.map((t) => probeStreamDurationSec(t.path)),
  );

  // Probe actual frame dimensions and rotation metadata from the recorded .mp4 files.
  // Flutter apps report landscape dims (e.g. 1280×720) in appData even when the actual
  // encoded frames may differ. The .mp4 may also contain rotation metadata (side_data/tags)
  // that FFmpeg would auto-apply — we disable auto-rotate and handle it here explicitly.
  const probedFrameInfos = await Promise.all(
    videoTracks.map((t) => probeVideoFrameInfo(t.path)),
  );
  for (let i = 0; i < videoTracks.length; i++) {
    const probed = probedFrameInfos[i];
    if (probed) {
      const tr = videoTracks[i];
      const dimsChanged = tr.width !== probed.width || tr.height !== probed.height;
      const hasContainerRotation = probed.rotation !== 0;
      if (dimsChanged || hasContainerRotation) {
        console.log("[recording:merge:probe] overriding manifest with probed info", {
          producerId: tr.producerId,
          manifest: { width: tr.width, height: tr.height, rotation: tr.rotation },
          probed,
        });
      }
      if (dimsChanged) {
        tr.width = probed.width;
        tr.height = probed.height;
      }
      // If the .mp4 container has rotation metadata AND no explicit appData rotation was set,
      // use the container rotation. This handles cases where the encoder (e.g. iOS H.264)
      // sets rotation in the bitstream/container that appData didn't capture.
      if (hasContainerRotation && (tr.rotation === 0 || tr.rotation === undefined)) {
        tr.rotation = probed.rotation;
      }
    }
  }

  ({ tracks: videoTracks, durationsSec: videoProbedDurationsSec } =
    dedupeVideoTracksByProducerId(videoTracks, videoProbedDurationsSec));

  if (manifest.recordingScope === "call") {
    const collapsed = collapseCallVideosToOnePerParticipant(
      videoTracks,
      videoProbedDurationsSec,
    );
    videoTracks = collapsed.tracks;
    videoProbedDurationsSec = collapsed.durationsSec;
    if (videoTracks.length >= 2) {
      const sorted = sortCallVideosByDelayAsc(
        videoTracks,
        videoProbedDurationsSec,
      );
      videoTracks = sorted.tracks;
      videoProbedDurationsSec = sorted.durationsSec;
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
    // Disable auto-rotation so FFmpeg doesn't apply container/side-data rotation.
    // The filter graph handles orientation explicitly via buildVideoOrientationFilters.
    args.push("-noautorotate", "-i", path.resolve(t.path));
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

    const useDynamicEqualCall =
      videoTracks.length >= 2 &&
      (videoTracks.length > 2 ||
        shouldStaggerCallTwoVideoLayout(videoTracks, T));
    const { filterParts, videoOutLabel } = useDynamicEqualCall
      ? buildDynamicEqualCallLayoutChain({
          videoInputIndices: videoIndices,
          targetWidth,
          targetHeight,
          tracks: videoTracks,
          videoProbedDurationsSec,
          baseInputIdx: baseIdx,
          fps,
          totalDurationSec: T,
          applyHalfTurnRotation,
        })
      : buildGridOverlayChain({
          videoInputIndices: videoIndices,
          targetWidth,
          targetHeight,
          tracks: videoTracks,
          videoProbedDurationsSec,
          baseInputIdx: baseIdx,
          fps,
          totalDurationSec: T,
          applyHalfTurnRotation,
          recordingScope: manifest.recordingScope,
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
