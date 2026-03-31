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
  return path.join(recordingConfig.tempUploadDir, "screen-recordings", recordingId);
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
    // Video: H.264 optimized for screen content
    "-c:v",
    "libx264",
    "-preset",
    "faster",       // better compression than veryfast, still reasonable speed
    "-crf",
    "28",            // higher CRF = smaller file (28 is great for screen, text stays sharp)
    "-tune",
    "stillimage",    // optimized for screen content (mostly static with text)
    "-pix_fmt",
    "yuv420p",
    "-vf",
    "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease:flags=lanczos",
    // Audio: AAC mono at 64k (voice only, no music)
    "-c:a",
    "aac",
    "-b:a",
    "64k",
    "-ac",
    "1",             // mono — halves audio size, fine for voice
    "-movflags",
    "+faststart",    // enables progressive playback (important for mobile)
    path.resolve(outputFilePath),
  ]);
}

function getPublicUploadsDir() {
  return path.resolve(__dirname, "..", "public", "uploads");
}

function getRecordingContentType(objectKey: string) {
  if (objectKey.endsWith(".mp4")) return "video/mp4";
  if (objectKey.endsWith(".webm")) return "video/webm";
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

    const mp4Path = path.join(baseDir, "screen-recording.mp4");

    // Server-side recording writes a raw.webm via FFmpeg + mediasoup PlainTransports.
    // Client-side chunk upload writes chunks that need merging.
    const rawWebmPath = recording.rawFilePath || null;
    const mergedWebmPath = path.join(baseDir, "merged.webm");

    let sourceWebmPath: string;

    if (rawWebmPath && fs.existsSync(rawWebmPath)) {
      // Server-side recording: use the raw.webm directly
      console.log("[screen-recording:process] using server-side raw webm", {
        recordingId: id,
        rawWebmPath,
      });
      sourceWebmPath = rawWebmPath;
    } else if (rawWebmPath && !fs.existsSync(rawWebmPath)) {
      // Wait briefly for FFmpeg to flush
      const startedAt = Date.now();
      while (Date.now() - startedAt < 20000) {
        if (fs.existsSync(rawWebmPath)) break;
        await new Promise((r) => setTimeout(r, 500));
      }
      if (!fs.existsSync(rawWebmPath)) {
        throw new Error(`Server-side raw webm not found after waiting: ${rawWebmPath}`);
      }
      sourceWebmPath = rawWebmPath;
    } else {
      // Client-side chunk upload fallback: merge chunks
      console.log("[screen-recording:process] merging chunks (client upload)", { recordingId: id });
      await mergeChunks(id, mergedWebmPath);
      sourceWebmPath = mergedWebmPath;
    }

    let playbackObjectKey = `screen-recordings/${id}/recording.webm`;
    let playbackFilePath = sourceWebmPath;
    let playbackUrl = `/uploads/${playbackObjectKey}`;

    // Try MP4 transcode for better browser/mobile playback.
    try {
      console.log("[screen-recording:process] transcode to mp4", { recordingId: id });
      await transcodeWebmToMp4(sourceWebmPath, mp4Path);
      playbackObjectKey = `screen-recordings/${id}/screen-recording.mp4`;
      playbackFilePath = mp4Path;
      playbackUrl = `/uploads/${playbackObjectKey}`;
    } catch (transcodeError: any) {
      console.warn("[screen-recording:process] mp4 transcode failed, falling back to webm", {
        recordingId: id,
        error: transcodeError?.message || String(transcodeError),
      });
    }

    // Upload to S3 cloud storage.
    // Always try S3 first. Only fall back to local if S3 credentials are missing.
    const s3Ready = process.env.S3_ACCESS_KEY && process.env.S3_SECRET_ACCESS_KEY
      && process.env.S3_REGION && process.env.S3_BUCKETS_NAME;

    if (s3Ready) {
      console.log("[screen-recording:process] uploading to S3", {
        recordingId: id,
        playbackObjectKey,
      });
      playbackUrl = await uploadToS3CompatibleBucket(playbackFilePath, playbackObjectKey);
      console.log("[screen-recording:process] S3 upload done", { recordingId: id, playbackUrl });
    } else {
      // Local fallback only when S3 is not configured at all.
      const publicUploadsDir = getPublicUploadsDir();
      const finalRelativePath = playbackObjectKey.replace(/^\/+/, "");
      const finalDestPath = path.join(publicUploadsDir, finalRelativePath);
      await ensureDir(path.dirname(finalDestPath));

      console.log("[screen-recording:process] copying final file (local fallback — no S3 configured)", {
        recordingId: id,
        finalDestPath,
      });
      await fsp.copyFile(playbackFilePath, finalDestPath);
    }

    recording.rawObjectKey = playbackObjectKey;
    recording.playbackUrl = playbackUrl;
    recording.status = "ready";
    recording.errorMessage = "";
    await recording.save();

    console.log("[screen-recording:process] ready", { recordingId: id, playbackUrl });

    // Clean up temp files (chunks, merged webm, mp4) — everything is on S3 now.
    try {
      await fsp.rm(baseDir, { recursive: true, force: true });
      console.log("[screen-recording:process] temp files cleaned up", { recordingId: id, baseDir });
    } catch (cleanupErr: any) {
      console.warn("[screen-recording:process] temp cleanup failed (non-fatal)", {
        recordingId: id,
        error: cleanupErr?.message || String(cleanupErr),
      });
    }

    // Create a chat message so all group members can see the recording in history.
    const group = await Group.findById(recording.groupId, { currentUsers: 1 }).lean();
    const sender = await USERS.findById(recording.startedBy, { name: 1 }).lean();

    const recipients = group?.currentUsers || [];
    if (recipients.length === 0) return;

    const savedMessage = await Message.create({
      senderId: recording.startedBy,
      groupId: recording.groupId,
      senderName: sender?.name || "Admin",
      message: playbackUrl,
      fileName: `Screen Recording | ${recording.durationSec || 0}s`,
      messageType: "screen_recording",
      createdAt: new Date(),
      allRecipients: recipients,
    });

    const senderDetails = await USERS.findOne({ _id: recording.startedBy }, { password: 0 }).lean();

    const socketPayload = {
      ...savedMessage.toObject(),
      senderDataAll: senderDetails,
    };

    // Emit to each group member's personal room (userId) so they receive it
    // even after leaving the call room.
    const senderId = recording.startedBy?.toString() || "";
    const receiverIds = recipients
      .map((id: any) => id?.toString?.() || "")
      .filter((id: string) => id && id !== senderId);

    emitMessageToUsers(senderId, receiverIds, socketPayload);

    // Also emit to the call room in case anyone is still in the call.
    emitMessageToRoom(recording.groupId, socketPayload);
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
