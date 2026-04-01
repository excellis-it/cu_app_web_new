import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

import CallRecording from "../db/schemas/callrecording.schema";
import Message from "../db/schemas/message.schema";
import Group from "../db/schemas/group.schema";
import USERS from "../db/schemas/users.schema";

import { emitMessageToRoom } from "../socket";
import { recordingConfig } from "./recordingConfig";
import logError from "./logError";

const ffmpegBinary = process.env.FFMPEG_PATH || "ffmpeg";

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    // eslint-disable-next-line no-console
    console.log("[recording:process] ffmpeg exec", { ffmpegBinary, args });

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
  return path.join(recordingConfig.tempUploadDir, recordingId);
}

function getChunksDir(recordingId: string) {
  return path.join(getRecordingBaseDir(recordingId), "chunks");
}

async function mergeChunks(recordingId: string, outputFilePath: string) {
  const chunksDir = getChunksDir(recordingId);
  const allFiles = await fsp.readdir(chunksDir);

  const chunkFiles = allFiles
    .filter((fileName) => fileName.endsWith(".chunk"))
    .sort((a, b) => Number(a.replace(".chunk", "")) - Number(b.replace(".chunk", "")));

  if (chunkFiles.length === 0) {
    throw new Error("No chunk files found to merge.");
  }

  // eslint-disable-next-line no-console
  console.log("[recording:process] mergeChunks", {
    recordingId,
    chunksDir,
    chunkCount: chunkFiles.length,
    chunkFiles: chunkFiles.slice(0, 10),
  });

  const indices = chunkFiles.map((f) => Number(f.replace(".chunk", "")));
  console.log("[recording:process] mergeChunks indices", {
    recordingId,
    minIndex: Math.min(...indices),
    maxIndex: Math.max(...indices),
    indicesPreview: indices.slice(0, 20),
  });

  const concatListPath = path.join(getRecordingBaseDir(recordingId), "concat-list.txt");
  const concatContent = chunkFiles
    .map((fileName) => {
      const fullPath = path
        .resolve(chunksDir, fileName)
        .replaceAll("\\", "/");
      return `file '${fullPath}'`;
    })
    .join("\n");

  await fsp.writeFile(concatListPath, concatContent, "utf8");

  const resolvedConcatListPath = path.resolve(concatListPath);
  const resolvedOutputPath = path.resolve(outputFilePath);

  await runFfmpeg([
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    resolvedConcatListPath,
    "-c",
    "copy",
    resolvedOutputPath,
  ]);

  const mergedStat = await fsp.stat(resolvedOutputPath);
  // eslint-disable-next-line no-console
  console.log("[recording:process] merge complete", {
    recordingId,
    mergedSizeBytes: mergedStat.size,
    outputFilePath: resolvedOutputPath,
  });
}

async function transcodeWebmToMp4(inputFilePath: string, outputFilePath: string) {
  await runFfmpeg([
    "-y",
    "-i",
    path.resolve(inputFilePath),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    path.resolve(outputFilePath),
  ]);
}

function getPublicUploadsDir() {
  // Mirror the path strategy used in upload helpers (write into backend public/uploads).
  return path.resolve(__dirname, "..", "public", "uploads");
}

function getRecordingContentType(objectKey: string) {
  if (objectKey.endsWith(".mp4")) return "video/mp4";
  if (objectKey.endsWith(".webm")) return "video/webm";
  return "application/octet-stream";
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 2000): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      if (attempt === retries) throw err;
      console.warn(`[recording:process] retry ${attempt}/${retries} after error: ${err?.message || String(err)}`);
      await new Promise((r) => setTimeout(r, delayMs * attempt));
    }
  }
  throw new Error("withRetry: unreachable");
}

async function uploadToS3CompatibleBucket(localFilePath: string, objectKey: string) {
  const cdnBaseUrl = recordingConfig.cdnBaseUrl;
  if (!cdnBaseUrl) {
    throw new Error("RECORDING_CDN_BASE_URL is not configured.");
  }

  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const region = process.env.S3_REGION;
  const bucketName = process.env.S3_BUCKETS_NAME;
  if (!accessKeyId || !secretAccessKey || !region || !bucketName) {
    throw new Error("Missing S3 credentials/env (S3_ACCESS_KEY/S3_SECRET_ACCESS_KEY/S3_REGION/S3_BUCKETS_NAME).");
  }

  // DigitalOcean Spaces (S3-compatible) default endpoint pattern.
  // If you use another provider, set S3_ENDPOINT to override.
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

  return `${String(cdnBaseUrl).replace(/\/+$/, "")}/${objectKey}`;
}

async function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    await fsp.mkdir(dir, { recursive: true });
  }
}

export async function processRecordingInBackground(recordingId: string) {
  const recording = await CallRecording.findById(recordingId);
  if (!recording) return;

  try {
    // eslint-disable-next-line no-console
    console.log("[recording:process] started", {
      recordingId,
      groupId: recording.groupId,
      startedBy: recording.startedBy?.toString?.() || "",
    });

    const id = recording._id.toString();
    const baseDir = getRecordingBaseDir(id);
    await ensureDir(baseDir);

    // Server-side recording (Phase 1) writes a single raw.mp4 or raw.webm at stop time.
    // Client-side chunk flow writes merged.webm after receiving chunks.
    const rawFilePath = recording.rawFilePath || null;
    const isServerMp4 = rawFilePath && rawFilePath.endsWith(".mp4");
    
    const mergedWebmPath = path.join(baseDir, "merged.webm");
    const mp4Path = path.join(baseDir, "recording.mp4");

    if (rawFilePath) {
      if (!fs.existsSync(rawFilePath)) {
        // Give a short grace period for ffmpeg to flush to disk.
        const startedAt = Date.now();
        while (Date.now() - startedAt < 20000) {
          if (fs.existsSync(rawFilePath)) break;
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, 500));
        }
      }

      if (!fs.existsSync(rawFilePath)) {
        throw new Error(
          `Server-side raw file not found after waiting: ${rawFilePath}`,
        );
      }

      console.log(`[recording:process] using server-side raw ${isServerMp4 ? "mp4" : "webm"}`, {
        recordingId: id,
        rawFilePath,
      });
    } else {
      // Client-side chunk upload mode: merge chunks into merged.webm.
      console.log("[recording:process] merging chunks (client upload flow)", {
        recordingId: id,
        mergedWebmPath,
      });
      await mergeChunks(id, mergedWebmPath);
    }

    // eslint-disable-next-line no-console
    console.log("[recording:process] merged.webm exists", {
      recordingId: id,
    });

    let playbackObjectKey = isServerMp4 ? `recordings/${id}/recording.mp4` : `recordings/${id}/merged.webm`;
    let playbackFilePath = rawFilePath ? rawFilePath : mergedWebmPath;
    let playbackUrl = `/uploads/${playbackObjectKey}`; 

    // Try MP4 transcode ONLY if the source is not already MP4
    if (!isServerMp4) {
      try {
        console.log("[recording:process] transcode to mp4", { recordingId: id, mp4Path });
        const transcodeSource = rawFilePath ? rawFilePath : mergedWebmPath;
        await transcodeWebmToMp4(transcodeSource, mp4Path);
        playbackObjectKey = `recordings/${id}/recording.mp4`;
        playbackFilePath = mp4Path;
        playbackUrl = `/uploads/${playbackObjectKey}`;
      } catch (transcodeError: any) {
        console.warn("[recording:process] mp4 transcode failed, falling back to webm", {
          recordingId: id,
          error: transcodeError?.message || String(transcodeError),
        });
      }
    } else {
      console.log("[recording:process] source is already MP4, skipping transcode", { recordingId: id });
    }

    // Upload final file to CDN (Phase: record -> CDN -> chat message)
    if (recordingConfig.cdnBaseUrl) {
      console.log("[recording:process] uploading to CDN", {
        recordingId: id,
        playbackObjectKey,
        cdnBaseUrl: recordingConfig.cdnBaseUrl,
      });
      playbackUrl = await withRetry(() => uploadToS3CompatibleBucket(playbackFilePath, playbackObjectKey));
      console.log("[recording:process] cdn upload done", {
        recordingId: id,
        playbackUrl,
      });
    } else {
      // Local fallback (dev / when CDN env vars are missing)
      const publicUploadsDir = getPublicUploadsDir();
      const finalRelativePath = playbackObjectKey.replace(/^\/+/, "");
      const finalDestPath = path.join(publicUploadsDir, finalRelativePath);
      await ensureDir(path.dirname(finalDestPath));

      console.log("[recording:process] copying final file (local fallback)", {
        recordingId: id,
        playbackFilePath,
        finalDestPath,
      });
      await fsp.copyFile(playbackFilePath, finalDestPath);

      const finalStat = await fsp.stat(finalDestPath);
      console.log("[recording:process] copied final file (local)", {
        recordingId: id,
        finalDestPath,
        finalSizeBytes: finalStat.size,
      });
    }

    recording.rawFilePath = playbackFilePath;
    recording.rawObjectKey = playbackObjectKey;
    recording.playbackUrl = playbackUrl;
    recording.status = "ready";
    recording.errorMessage = "";
    await recording.save();

    // eslint-disable-next-line no-console
    console.log("[recording:process] ready", { recordingId: id, playbackUrl });

    const group = await Group.findById(recording.groupId, { currentUsers: 1 }).lean();
    const sender = await USERS.findById(recording.startedBy, { name: 1 }).lean();

    const recipients = group?.currentUsers || [];
    if (recipients.length === 0) return;

    const savedMessage = await Message.create({
      senderId: recording.startedBy,
      groupId: recording.groupId,
      senderName: sender?.name || "Admin",
      message: playbackUrl,
      fileName: `Call Recording | ${recording.durationSec || 0}s`,
      messageType: "video",
      createdAt: new Date(),
      allRecipients: recipients,
    });

    const senderDetails = await USERS.findOne({ _id: recording.startedBy }, { password: 0 }).lean();

    const socketPayload = {
      ...savedMessage.toObject(),
      senderDataAll: senderDetails,
    };

    emitMessageToRoom(recording.groupId, socketPayload);
  } catch (error: any) {
    recording.status = "failed";
    recording.errorMessage = error?.message || "Recording processing failed";
    await recording.save();
    // eslint-disable-next-line no-console
    console.error("[recording:process] failed", {
      recordingId: recordingId,
      error: error?.message || String(error),
    });

    // Notify the room so the UI can stop showing "processing" state
    try {
      emitMessageToRoom(recording.groupId, {
        type: "recording-processing-failed",
        recordingId,
        groupId: recording.groupId,
        errorMessage: error?.message || "Recording processing failed",
      });
    } catch {
      // non-fatal
    }

    logError(error, {
      category: "call",
      event: "RECORDING_PROCESS",
      message: "Error processing recording with ffmpeg",
      meta: { recordingId },
    });
  }
}

