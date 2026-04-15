import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

import ScreenRecording from "../db/schemas/screen-recording.schema";
import Message from "../db/schemas/message.schema";
import { recordingConfig } from "./recordingConfig";

const RETENTION_DAYS = Number(process.env.SCREEN_RECORDING_RETENTION_DAYS) || 30;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // Run once every 24 hours

function getS3Client() {
  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const region = process.env.S3_REGION;
  if (!accessKeyId || !secretAccessKey || !region) return null;

  const endpoint =
    process.env.S3_ENDPOINT || `https://${region}.digitaloceanspaces.com`;

  return new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
    endpoint,
  });
}

async function deleteFromS3(objectKey: string) {
  const bucketName = process.env.S3_BUCKETS_NAME;
  if (!bucketName || !objectKey) return;

  const s3 = getS3Client();
  if (!s3) return;

  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
      }),
    );
    console.log("[screen-recording:cleanup] deleted from S3", { objectKey });
  } catch (e: any) {
    console.warn("[screen-recording:cleanup] S3 delete failed", {
      objectKey,
      error: e?.message || String(e),
    });
  }
}

async function runCleanup() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);

  console.log("[screen-recording:cleanup] starting", {
    retentionDays: RETENTION_DAYS,
    cutoffDate: cutoffDate.toISOString(),
  });

  try {
    // Find expired recordings
    const expiredRecordings = await ScreenRecording.find({
      createdAt: { $lt: cutoffDate },
      status: { $in: ["ready", "failed"] },
    }).lean();

    if (expiredRecordings.length === 0) {
      console.log("[screen-recording:cleanup] no expired recordings found");
      return;
    }

    console.log("[screen-recording:cleanup] found expired recordings", {
      count: expiredRecordings.length,
    });

    for (const recording of expiredRecordings) {
      const recordingId = recording._id.toString();

      try {
        // 1) Delete from S3/CDN
        if (recording.rawObjectKey) {
          await deleteFromS3(recording.rawObjectKey);
        }

        // 2) Update the chat message to show "Recording expired"
        if (recording.playbackUrl && recording.groupId) {
          await Message.updateMany(
            {
              groupId: recording.groupId,
              messageType: "screen_recording",
              message: recording.playbackUrl,
            },
            {
              $set: {
                message: "expired",
                fileName: `Call Recording expired (was ${recording.durationSec || 0}s)`,
              },
            },
          );
        }

        // 3) Delete the recording document
        await ScreenRecording.deleteOne({ _id: recording._id });

        console.log("[screen-recording:cleanup] deleted", { recordingId });
      } catch (e: any) {
        console.error("[screen-recording:cleanup] failed to delete recording", {
          recordingId,
          error: e?.message || String(e),
        });
      }
    }

    console.log("[screen-recording:cleanup] done", {
      deleted: expiredRecordings.length,
    });
  } catch (e: any) {
    console.error("[screen-recording:cleanup] run failed", {
      error: e?.message || String(e),
    });
  }
}

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the daily cleanup job. Safe to call multiple times — only one timer runs.
 */
export function startScreenRecordingCleanupJob() {
  if (cleanupTimer) return;

  console.log("[screen-recording:cleanup] scheduled", {
    retentionDays: RETENTION_DAYS,
    intervalHours: 24,
  });

  // Run once on startup (after a short delay to let DB connect)
  setTimeout(() => {
    runCleanup().catch((e) =>
      console.error("[screen-recording:cleanup] initial run error", e),
    );
  }, 30_000);

  // Then run every 24 hours
  cleanupTimer = setInterval(() => {
    runCleanup().catch((e) =>
      console.error("[screen-recording:cleanup] scheduled run error", e),
    );
  }, CLEANUP_INTERVAL_MS);
}
