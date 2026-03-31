import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

import ScreenRecording from "../db/schemas/screen-recording.schema";
import Message from "../db/schemas/message.schema";
import Group from "../db/schemas/group.schema";
import USERS from "../db/schemas/users.schema";

import { emitMessageToRoom, emitMessageToUsers } from "../socket";
import { recordingConfig } from "./recordingConfig";
import logError from "./logError";

const ffmpegBinary = process.env.FFMPEG_PATH || "ffmpeg";

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    console.log("[screen-recording:process] ffmpeg exec", { ffmpegBinary, args });

    const ffmpeg = spawn(ffmpegBinary, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    let stdout = "";

    ffmpeg.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    ffmpeg.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    ffmpeg.on("error", (error) => reject(error));
    ffmpeg.on("close", (code) => {
      if (code === 0) return resolve();
      reject(
        new Error(
          `ffmpeg failed with code ${code}. stderr=${stderr.slice(0, 2000)} stdout=${stdout.slice(0, 2000)}`,
        ),
      );
    });
  });
}

function getRecordingBaseDir(recordingId: string) {
  // Server-side recording writes raw.webm directly to {tempUploadDir}/{recordingId}/
  // so this must match the path used in recordingManager.ts
  return path.join(recordingConfig.tempUploadDir, recordingId);
}

function getChunksDir(recordingId: string) {
  return path.join(getRecordingBaseDir(recordingId), "chunks");
}

/**
 * Binary-concatenate chunk files into a single output file.
 * Browser MediaRecorder produces a continuous webm byte-stream split across
 * chunks, so plain binary concat produces a valid file without ffmpeg.
 */
async function mergeChunks(recordingId: string, outputFilePath: string) {
  const chunksDir = getChunksDir(recordingId);
  const allFiles = await fsp.readdir(chunksDir);

  const chunkFiles = allFiles
    .filter((fileName) => fileName.endsWith(".chunk"))
    .sort((a, b) => Number(a.replace(".chunk", "")) - Number(b.replace(".chunk", "")));

  if (chunkFiles.length === 0) {
    throw new Error("No chunk files found to merge.");
  }

  console.log("[screen-recording:process] mergeChunks (binary concat)", {
    recordingId,
    chunksDir,
    chunkCount: chunkFiles.length,
  });

  const writeStream = fs.createWriteStream(outputFilePath);

  for (const fileName of chunkFiles) {
    const chunkPath = path.join(chunksDir, fileName);
    await new Promise<void>((resolve, reject) => {
      const readStream = fs.createReadStream(chunkPath);
      readStream.pipe(writeStream, { end: false });
      readStream.on("end", resolve);
      readStream.on("error", reject);
    });
  }

  writeStream.end();
  await new Promise<void>((resolve, reject) => {
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
  });

  const mergedStat = await fsp.stat(outputFilePath);
  console.log("[screen-recording:process] merge complete", {
    recordingId,
    mergedSizeBytes: mergedStat.size,
  });
}

async function transcodeWebmToMp4(inputFilePath: string, outputFilePath: string) {
  await runFfmpeg([
    "-y",
    "-i",
    path.resolve(inputFilePath),
    // Video: H.264 optimized for video call content
    "-c:v",
    "libx264",
    "-preset",
    "faster",
    "-crf",
    "26",            // slightly lower CRF for better quality with video call faces
    "-tune",
    "zerolatency",   // reduces decoding latency, better for streaming playback
    "-profile:v",
    "baseline",      // maximum device compatibility (especially mobile)
    "-level",
    "3.1",
    "-pix_fmt",
    "yuv420p",
    "-vf",
    "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease:flags=lanczos",
    "-g",
    "48",            // keyframe every 2s at 24fps — enables fast seeking
    "-keyint_min",
    "48",
    // Audio: AAC mono at 64k (voice only)
    "-c:a",
    "aac",
    "-b:a",
    "64k",
    "-ac",
    "1",
    "-movflags",
    "+faststart",    // enables progressive playback (streams while loading)
    path.resolve(outputFilePath),
  ]);
}

/**
 * Transcode WebM → HLS (.m3u8 + .ts segments).
 * Each segment is ~4 seconds. Output goes to a directory.
 * Returns the list of created files (playlist + segments).
 */
async function transcodeWebmToHls(inputFilePath: string, hlsDir: string): Promise<string[]> {
  await ensureDir(hlsDir);
  const playlistPath = path.join(hlsDir, "playlist.m3u8");
  const segmentPattern = path.join(hlsDir, "seg-%03d.ts");

  await runFfmpeg([
    "-y",
    "-i",
    path.resolve(inputFilePath),
    // Video: H.264 baseline for max compatibility
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "28",
    "-profile:v", "baseline",
    "-level", "3.1",
    "-pix_fmt", "yuv420p",
    "-vf", "scale='min(854,iw)':'min(480,ih)':force_original_aspect_ratio=decrease:flags=lanczos",
    "-maxrate", "700k",
    "-bufsize", "1400k",
    // Audio: AAC mono
    "-c:a", "aac",
    "-b:a", "64k",
    "-ac", "1",
    // HLS settings
    "-f", "hls",
    "-hls_time", "4",                 // shorter segments improve startup/seek smoothness
    "-hls_list_size", "0",            // keep all segments in playlist
    "-hls_segment_filename", path.resolve(segmentPattern),
    "-hls_playlist_type", "vod",      // mark as video-on-demand
    path.resolve(playlistPath),
  ]);

  // Collect all created files
  const files = await fsp.readdir(hlsDir);
  return files.map((f) => path.join(hlsDir, f));
}

/**
 * Remux a fragmented MP4 into a normal MP4 with moov atom at the front.
 * This is a copy operation (no re-encoding) — very fast.
 * Required so browsers can read total duration from the header.
 */
async function remuxToFaststart(inputFilePath: string, outputFilePath: string) {
  await runFfmpeg([
    "-y",
    "-i",
    path.resolve(inputFilePath),
    "-c", "copy",
    "-movflags", "+faststart",
    path.resolve(outputFilePath),
  ]);
}

/**
 * Probe the duration of a media file using ffprobe.
 * Returns duration in seconds (integer), or 0 if probing fails.
 */
function getMediaDuration(filePath: string): Promise<number> {
  const ffprobeBinary = ffmpegBinary.replace(/ffmpeg(\.exe)?$/, "ffprobe$1");
  return new Promise((resolve, reject) => {
    const proc = spawn(ffprobeBinary, [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      path.resolve(filePath),
    ], { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    proc.on("error", (err) => reject(err));
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffprobe exited with code ${code}`));
      const dur = Math.round(parseFloat(stdout.trim()));
      resolve(Number.isFinite(dur) ? dur : 0);
    });
  });
}

function getPublicUploadsDir() {
  return path.resolve(__dirname, "..", "public", "uploads");
}

function getRecordingContentType(objectKey: string) {
  if (objectKey.endsWith(".mp4")) return "video/mp4";
  if (objectKey.endsWith(".webm")) return "video/webm";
  if (objectKey.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
  if (objectKey.endsWith(".ts")) return "video/mp2t";
  return "application/octet-stream";
}

async function uploadToS3CompatibleBucket(localFilePath: string, objectKey: string) {
  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const region = process.env.S3_REGION;
  const bucketName = process.env.S3_BUCKETS_NAME;
  if (!accessKeyId || !secretAccessKey || !region || !bucketName) {
    throw new Error("Missing S3 credentials/env (S3_ACCESS_KEY/S3_SECRET_ACCESS_KEY/S3_REGION/S3_BUCKETS_NAME).");
  }

  const endpoint =
    process.env.S3_ENDPOINT || `https://${region}.digitaloceanspaces.com`;

  const s3 = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
    endpoint,
  });

  const contentType = getRecordingContentType(objectKey);
  const objectAcl = (process.env.S3_OBJECT_ACL as any) || "public-read";

  const uploader = new Upload({
    client: s3,
    params: {
      Bucket: bucketName,
      Key: objectKey,
      Body: fs.createReadStream(localFilePath),
      ContentType: contentType,
      ACL: objectAcl,
    },
  });

  await uploader.done();

  // Build the public URL:
  // If RECORDING_CDN_BASE_URL is set, use it. Otherwise construct from endpoint + bucket.
  const cdnBaseUrl = recordingConfig.cdnBaseUrl;
  if (cdnBaseUrl) {
    return `${String(cdnBaseUrl).replace(/\/+$/, "")}/${objectKey}`;
  }

  // Default: https://<bucket>.<region>.digitaloceanspaces.com/<key>
  const endpointClean = String(endpoint).replace(/\/+$/, "");
  return `${endpointClean}/${bucketName}/${objectKey}`;
}

async function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    await fsp.mkdir(dir, { recursive: true });
  }
}

/**
 * Helper: upload a file to S3 or local, returning the playback URL.
 */
async function uploadFile(localFilePath: string, objectKey: string, recordingId: string): Promise<string> {
  const s3Ready = process.env.S3_ACCESS_KEY && process.env.S3_SECRET_ACCESS_KEY
    && process.env.S3_REGION && process.env.S3_BUCKETS_NAME;

  if (s3Ready) {
    console.log("[screen-recording:process] uploading to S3", { recordingId, objectKey });
    const url = await uploadToS3CompatibleBucket(localFilePath, objectKey);
    console.log("[screen-recording:process] S3 upload done", { recordingId, url });
    return url;
  }

  // Local fallback
  const publicUploadsDir = getPublicUploadsDir();
  const finalDestPath = path.join(publicUploadsDir, objectKey.replace(/^\/+/, ""));
  await ensureDir(path.dirname(finalDestPath));
  await fsp.copyFile(localFilePath, finalDestPath);
  return `/uploads/${objectKey}`;
}

/**
 * Helper: update or create chat message and emit to all group members.
 */
async function emitRecordingMessage(recording: any, playbackUrl: string, durationSec: number) {
  const group = await Group.findById(recording.groupId, { currentUsers: 1 }).lean();
  const recipients = (group as any)?.currentUsers || [];
  if (recipients.length === 0) return;

  const placeholderMsgId = recording.uploadSessionId || null;
  let savedMessage: any;

  if (placeholderMsgId) {
    savedMessage = await Message.findByIdAndUpdate(
      placeholderMsgId,
      { $set: { message: playbackUrl, fileName: `Screen Recording | ${durationSec}s` } },
      { new: true },
    );
  }

  if (!savedMessage) {
    const sender = await USERS.findById(recording.startedBy, { name: 1 }).lean();
    savedMessage = await Message.create({
      senderId: recording.startedBy,
      groupId: recording.groupId,
      senderName: (sender as any)?.name || "Admin",
      message: playbackUrl,
      fileName: `Screen Recording | ${durationSec}s`,
      messageType: "screen_recording",
      createdAt: new Date(),
      allRecipients: recipients,
    });
  }

  const senderDetails = await USERS.findOne({ _id: recording.startedBy }, { password: 0 }).lean();
  const socketPayload = { ...savedMessage.toObject(), senderDataAll: senderDetails };

  const senderId = recording.startedBy?.toString() || "";
  const receiverIds = recipients
    .map((id: any) => id?.toString?.() || "")
    .filter((id: string) => id && id !== senderId);

  emitMessageToUsers(senderId, receiverIds, socketPayload);
  emitMessageToRoom(recording.groupId, socketPayload);
}

export async function processScreenRecordingInBackground(recordingId: string) {
  const recording = await ScreenRecording.findById(recordingId);
  if (!recording) return;

  try {
    console.log("[screen-recording:process] started", {
      recordingId,
      groupId: recording.groupId,
      startedBy: recording.startedBy?.toString?.() || "",
    });

    const id = recording._id.toString();
    const baseDir = getRecordingBaseDir(id);
    await ensureDir(baseDir);

    const rawFilePath = recording.rawFilePath || null;

    // --- Resolve the source file ---
    let sourceFilePath: string;

    if (rawFilePath && fs.existsSync(rawFilePath)) {
      sourceFilePath = rawFilePath;
    } else if (rawFilePath && !fs.existsSync(rawFilePath)) {
      // Wait briefly for FFmpeg to flush
      const startedAt = Date.now();
      while (Date.now() - startedAt < 20000) {
        if (fs.existsSync(rawFilePath)) break;
        await new Promise((r) => setTimeout(r, 500));
      }
      if (!fs.existsSync(rawFilePath)) {
        throw new Error(`Server-side recording file not found after waiting: ${rawFilePath}`);
      }
      sourceFilePath = rawFilePath;
    } else {
      // Client-side chunk upload fallback: merge chunks
      const mergedWebmPath = path.join(baseDir, "merged.webm");
      console.log("[screen-recording:process] merging chunks (client upload)", { recordingId: id });
      await mergeChunks(id, mergedWebmPath);
      sourceFilePath = mergedWebmPath;
    }

    const rawSizeBytes = fs.statSync(sourceFilePath).size;

    // Probe duration from the source file
    let durationSec = recording.durationSec || 0;
    try {
      const probedDuration = await getMediaDuration(sourceFilePath);
      if (probedDuration > 0) durationSec = probedDuration;
    } catch {
      // Keep the socket-calculated duration as fallback
    }

    // ============================================================
    // PHASE 1: Upload raw WebM as fallback (keep chat card "processing")
    // ============================================================
    const webmObjectKey = `screen-recordings/${id}/recording.webm`;

    console.log("[screen-recording:process] phase 1: uploading raw WebM fallback", {
      recordingId: id,
      rawSizeBytes,
      durationSec,
    });

    const webmUrl = await uploadFile(sourceFilePath, webmObjectKey, id);

    // Keep processing state until HLS is ready.
    // This avoids temporary 0:00 duration/metadata issues from intermediate WebM playback.
    recording.rawObjectKey = webmObjectKey;
    recording.playbackUrl = webmUrl;
    recording.status = "processing";
    recording.errorMessage = "";
    recording.sizeBytes = rawSizeBytes;
    recording.durationSec = durationSec;
    await recording.save();

    console.log("[screen-recording:process] phase 1 uploaded fallback (still processing)", {
      recordingId: id,
      playbackUrl: webmUrl,
      durationSec,
      sizeBytes: rawSizeBytes,
    });

    // ============================================================
    // PHASE 2: Transcode to HLS in background → chunked streaming
    // Runs async — doesn't block Phase 1 completion or cleanup
    // ============================================================
    const rawFilePathCopy = sourceFilePath;
    const baseDirCopy = baseDir;

    // Don't await — let it run completely in background
    (async () => {
      const hlsDir = path.join(baseDirCopy, "hls");
      const hlsBaseKey = `screen-recordings/${id}/hls`;

      try {
        console.log("[screen-recording:process] phase 2: transcoding to HLS", { recordingId: id });
        const hlsFiles = await transcodeWebmToHls(rawFilePathCopy, hlsDir);

        // Upload all HLS files (playlist + segments) to S3
        let totalHlsBytes = 0;
        let hlsPlaylistUrl = "";
        for (const filePath of hlsFiles) {
          const fileName = path.basename(filePath);
          const objectKey = `${hlsBaseKey}/${fileName}`;
          const url = await uploadFile(filePath, objectKey, id);
          totalHlsBytes += fs.statSync(filePath).size;
          if (fileName === "playlist.m3u8") hlsPlaylistUrl = url;
        }

        // Update DB with HLS playlist URL
        await ScreenRecording.findByIdAndUpdate(id, {
          $set: {
            rawObjectKey: `${hlsBaseKey}/playlist.m3u8`,
            playbackUrl: hlsPlaylistUrl,
            sizeBytes: totalHlsBytes,
            status: "ready",
            errorMessage: "",
          },
        });

        console.log("[screen-recording:process] phase 2 ready (HLS)", {
          recordingId: id,
          playbackUrl: hlsPlaylistUrl,
          segments: hlsFiles.length - 1,
          totalHlsBytes,
        });

        // Emit updated URL to chat — player switches to HLS streaming
        try {
          const updatedRecording = await ScreenRecording.findById(id);
          if (updatedRecording) {
            await emitRecordingMessage(updatedRecording, hlsPlaylistUrl, durationSec);
          }
        } catch (emitErr: any) {
          console.warn("[screen-recording:process] phase 2 emit failed (non-fatal)", {
            recordingId: id,
            error: emitErr?.message || String(emitErr),
          });
        }
      } catch (transcodeError: any) {
        console.warn("[screen-recording:process] phase 2 HLS failed (WebM still available)", {
          recordingId: id,
          error: transcodeError?.message || String(transcodeError),
        });
        // Fallback to WebM so recording is still delivered.
        try {
          await ScreenRecording.findByIdAndUpdate(id, {
            $set: {
              status: "ready",
              errorMessage: "",
              playbackUrl: webmUrl,
              rawObjectKey: webmObjectKey,
              sizeBytes: rawSizeBytes,
              durationSec,
            },
          });
          const fallbackRecording = await ScreenRecording.findById(id);
          if (fallbackRecording) {
            await emitRecordingMessage(fallbackRecording, webmUrl, durationSec);
          }
        } catch (fallbackErr: any) {
          console.warn("[screen-recording:process] fallback WebM emit failed", {
            recordingId: id,
            error: fallbackErr?.message || String(fallbackErr),
          });
        }
      } finally {
        // ALWAYS clean up temp files — regardless of success or failure
        try {
          await fsp.rm(baseDirCopy, { recursive: true, force: true });
          console.log("[screen-recording:process] temp files cleaned up", { recordingId: id });
        } catch {
          // ignore
        }
      }
    })();
  } catch (error: any) {
    recording.status = "failed";
    recording.errorMessage = error?.message || "Screen recording processing failed";
    await recording.save();
    console.error("[screen-recording:process] failed", {
      recordingId,
      error: error?.message || String(error),
    });

    logError(error, {
      category: "screen-recording",
      event: "SCREEN_RECORDING_PROCESS",
      message: "Error processing screen recording",
      meta: { recordingId },
    });
  }
}

/**
 * Cleanup orphaned temp directories on startup.
 * Removes any recording temp dir whose DB record is already "ready" or "failed".
 * Call this once when the server starts.
 */
export async function cleanupOrphanedTempFiles() {
  const tempDir = recordingConfig.tempUploadDir;
  if (!fs.existsSync(tempDir)) return;

  try {
    const entries = await fsp.readdir(tempDir);
    let cleaned = 0;

    for (const entry of entries) {
      // Skip non-recording directories like "screen-recordings"
      if (!entry.match(/^[a-f0-9]{24}$/)) continue;

      const fullPath = path.join(tempDir, entry);
      const stat = await fsp.stat(fullPath).catch(() => null);
      if (!stat || !stat.isDirectory()) continue;

      // Check if DB record exists and is complete
      const recording = await ScreenRecording.findById(entry, { status: 1 }).lean();
      if (!recording || recording.status === "ready" || recording.status === "failed") {
        await fsp.rm(fullPath, { recursive: true, force: true });
        cleaned++;
        console.log("[screen-recording:cleanup] removed orphaned temp dir", { id: entry, status: recording?.status || "missing" });
      }
    }

    if (cleaned > 0) {
      console.log("[screen-recording:cleanup] startup cleanup done", { cleaned });
    }
  } catch (err: any) {
    console.warn("[screen-recording:cleanup] startup cleanup error (non-fatal)", {
      error: err?.message || String(err),
    });
  }
}
