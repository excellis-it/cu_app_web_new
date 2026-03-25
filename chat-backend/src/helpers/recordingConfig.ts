import fs from "node:fs";
import path from "node:path";

const DEFAULT_MAX_DURATION_SEC = 60 * 60; // 1 hour
const DEFAULT_MAX_SIZE_BYTES = 4 * 1024 * 1024 * 1024; // 4 GB
const DEFAULT_MAX_CHUNK_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const DEFAULT_TEMP_UPLOAD_DIR = path.resolve(process.cwd(), "tmp", "recordings");

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
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
};

export function getRecordingCdnBaseUrl() {
  return recordingConfig.cdnBaseUrl;
}

export function ensureRecordingTempDirectory() {
  if (!fs.existsSync(recordingConfig.tempUploadDir)) {
    fs.mkdirSync(recordingConfig.tempUploadDir, { recursive: true });
  }
}

