import fs from "node:fs";
import path from "node:path";

const DEFAULT_MAX_DURATION_SEC = 60 * 60; // 1 hour
const DEFAULT_MAX_SIZE_BYTES = 4 * 1024 * 1024 * 1024; // 4 GB
const DEFAULT_MAX_CHUNK_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const DEFAULT_UPLOAD_SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_TEMP_UPLOAD_DIR = path.resolve(process.cwd(), "tmp", "recordings");

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

/** Grid cell scaling: "cover" = fill cell (center crop). "contain" = letterbox in cell (full frame visible). */
export function getRecordingGridCellFit(): "cover" | "contain" {
  const v = String(process.env.RECORDING_GRID_CELL_FIT || "contain").toLowerCase();
  return v === "cover" ? "cover" : "contain";
}

/**
 * Flutter often sends landscape resolution + portraitLock with rotation 0. We pick an FFmpeg
 * `transpose` for that heuristic: 1 = 90° CW, 2 = 90° CCW. Using CW when the bitstream was
 * already rotated the other way yields a 180° (upside-down) composite. Default CCW (`2`).
 * Set RECORDING_FLUTTER_PORTRAIT_TRANSPOSE=1 (or cw) to restore the old behavior.
 */
export function getRecordingFlutterPortraitTranspose(): 1 | 2 {
  const v = String(process.env.RECORDING_FLUTTER_PORTRAIT_TRANSPOSE || "2").toLowerCase();
  if (v === "1" || v === "cw" || v === "clockwise") return 1;
  return 2;
}

export const recordingConfig = {
  tempUploadDir: process.env.RECORDING_TEMP_UPLOAD_DIR || DEFAULT_TEMP_UPLOAD_DIR,
  cdnBaseUrl: process.env.RECORDING_CDN_BASE_URL || "",
  maxDurationSec: parsePositiveInt(
    process.env.RECORDING_MAX_DURATION_SEC,
    DEFAULT_MAX_DURATION_SEC,
  ),
  maxSizeBytes: parsePositiveInt(
    process.env.RECORDING_MAX_SIZE_BYTES,
    DEFAULT_MAX_SIZE_BYTES,
  ),
  maxChunkSizeBytes: parsePositiveInt(
    process.env.RECORDING_MAX_CHUNK_SIZE_BYTES,
    DEFAULT_MAX_CHUNK_SIZE_BYTES,
  ),
  uploadSessionTimeoutMs: parsePositiveInt(
    process.env.RECORDING_UPLOAD_SESSION_TIMEOUT_MS,
    DEFAULT_UPLOAD_SESSION_TIMEOUT_MS,
  ),
};

export function getRecordingCdnBaseUrl() {
  return recordingConfig.cdnBaseUrl;
}

export function ensureRecordingTempDirectory() {
  if (!fs.existsSync(recordingConfig.tempUploadDir)) {
    fs.mkdirSync(recordingConfig.tempUploadDir, { recursive: true });
  }
}

