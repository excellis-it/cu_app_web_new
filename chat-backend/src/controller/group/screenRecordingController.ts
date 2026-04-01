import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

import Group from "../../db/schemas/group.schema";
import ScreenRecording from "../../db/schemas/screen-recording.schema";
import USERS from "../../db/schemas/users.schema";

import { recordingConfig, ensureRecordingTempDirectory } from "../../helpers/recordingConfig";
import { processScreenRecordingInBackground } from "../../helpers/screenRecordingProcessor";

const ALLOWED_MIME_TYPES = new Set([
  "video/webm",
  "video/mp4",
  "video/x-matroska",
  "audio/webm",
  "audio/ogg",
]);

function toStringId(value: any) {
  return value?.toString?.() || "";
}

/**
 * Only SuperAdmin and admin roles can initiate screen recording.
 * This is role-based (not group-admin based) so it works the same on mobile.
 */
function ensureScreenRecordingRole(user: any) {
  const userType = user?.userType;
  if (userType !== "SuperAdmin" && userType !== "admin") {
    throw new Error("Only SuperAdmin and Admin users can perform screen recording.");
  }
}

async function ensureGroupMemberAccess(groupId: string, userId: string) {
  const group = await Group.findById(groupId, { currentUsers: 1 }).lean();
  if (!group?.currentUsers?.some((memberId: any) => toStringId(memberId) === userId)) {
    throw new Error("You are not a member of this group.");
  }
}

function getScreenRecordingDir(recordingId: string) {
  return path.join(recordingConfig.tempUploadDir, "screen-recordings", recordingId);
}

function getChunksDir(recordingId: string) {
  return path.join(getScreenRecordingDir(recordingId), "chunks");
}

async function getSizeFromChunks(recordingId: string) {
  const chunksDir = getChunksDir(recordingId);
  if (!fs.existsSync(chunksDir)) return 0;

  const files = await fsp.readdir(chunksDir);
  let total = 0;
  for (const fileName of files) {
    const filePath = path.join(chunksDir, fileName);
    const stat = await fsp.stat(filePath);
    if (stat.isFile()) total += stat.size;
  }
  return total;
}

/**
 * POST /screen-recordings/init
 * Creates a ScreenRecording document and returns an uploadSessionId.
 */
export async function initScreenRecording(body: any, user: any) {
  ensureRecordingTempDirectory();
  ensureScreenRecordingRole(user);

  const groupId = body?.groupId;
  const mimeType = body?.mimeType || "video/webm";
  const userId = toStringId(user?._id);

  if (!groupId) throw new Error("groupId is required.");
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error(`Unsupported mimeType: ${mimeType}. Allowed: ${[...ALLOWED_MIME_TYPES].join(", ")}`);
  }
  if (!userId) throw new Error("User context is missing.");

  await ensureGroupMemberAccess(groupId, userId);

  console.log("[screen-recording:init] start", { groupId, userId, mimeType });

  const uploadSessionId = crypto.randomUUID();

  const newRecording = await ScreenRecording.create({
    groupId,
    startedBy: user._id,
    status: "uploading",
    mimeType,
    uploadSessionId,
  });

  const chunksDir = getChunksDir(toStringId(newRecording._id));
  await fsp.mkdir(chunksDir, { recursive: true });

  console.log("[screen-recording:init] ok", {
    recordingId: toStringId(newRecording._id),
    uploadSessionId,
  });

  return {
    recordingId: toStringId(newRecording._id),
    uploadSessionId,
    status: newRecording.status,
    maxDurationSec: recordingConfig.maxDurationSec,
    maxSizeBytes: recordingConfig.maxSizeBytes,
    maxChunkSizeBytes: recordingConfig.maxChunkSizeBytes,
  };
}

/**
 * POST /screen-recordings/chunk
 * Receives a single binary chunk and writes it to disk.
 */
export async function uploadScreenRecordingChunk(body: any, user: any, file: any) {
  ensureRecordingTempDirectory();
  ensureScreenRecordingRole(user);

  const recordingId = body?.recordingId;
  const uploadSessionId = body?.uploadSessionId;
  const chunkIndex = Number(body?.chunkIndex);
  const groupId = body?.groupId;
  const userId = toStringId(user?._id);

  const chunkBuffer: Buffer | undefined = file?.buffer;
  const chunkBytes = chunkBuffer?.length || 0;

  if (!recordingId || !uploadSessionId || !groupId || !Number.isInteger(chunkIndex)) {
    throw new Error("recordingId, groupId, uploadSessionId and chunkIndex are required.");
  }
  if (!chunkBuffer || !chunkBytes) {
    throw new Error("chunk file is required.");
  }
  if (!userId) throw new Error("User context is missing.");

  console.log("[screen-recording/chunk] recv", {
    groupId,
    recordingId,
    uploadSessionId,
    chunkIndex,
    chunkBytes,
  });

  if (chunkBytes > recordingConfig.maxChunkSizeBytes) {
    throw new Error("Chunk exceeds maximum allowed size.");
  }

  const recording = await ScreenRecording.findOne({
    _id: recordingId,
    groupId,
    uploadSessionId,
    status: "uploading",
  });

  if (!recording) {
    throw new Error("Upload session is invalid or expired.");
  }

  // Check upload session timeout
  const sessionAge = Date.now() - new Date(recording.updatedAt).getTime();
  if (sessionAge > recordingConfig.uploadSessionTimeoutMs) {
    recording.status = "failed";
    recording.errorMessage = "Upload session timed out.";
    await recording.save();
    throw new Error("Upload session has expired. Please start a new recording.");
  }

  const chunksDir = getChunksDir(recordingId);
  await fsp.mkdir(chunksDir, { recursive: true });

  const chunkPath = path.join(chunksDir, `${chunkIndex}.chunk`);
  await fsp.writeFile(chunkPath, chunkBuffer);

  const received = new Set(recording.receivedChunks || []);
  received.add(chunkIndex);
  recording.receivedChunks = [...received].sort((a, b) => a - b);
  recording.sizeBytes = await getSizeFromChunks(recordingId);

  if (recording.sizeBytes > recordingConfig.maxSizeBytes) {
    throw new Error("Recording size exceeds the configured maximum limit.");
  }

  await recording.save();

  console.log("[screen-recording/chunk] updated", {
    recordingId: toStringId(recording._id),
    receivedChunks: recording.receivedChunks.length,
    sizeBytes: recording.sizeBytes,
  });

  return {
    recordingId: toStringId(recording._id),
    receivedChunks: recording.receivedChunks.length,
    sizeBytes: recording.sizeBytes,
    status: recording.status,
  };
}

/**
 * POST /screen-recordings/complete
 * Finalizes the upload: verifies all chunks received, triggers background processing.
 */
export async function completeScreenRecording(body: any, user: any) {
  ensureRecordingTempDirectory();
  ensureScreenRecordingRole(user);

  const recordingId = body?.recordingId;
  const uploadSessionId = body?.uploadSessionId;
  const totalChunks = Number(body?.totalChunks);
  const durationSec = Number(body?.durationSec || 0);
  const groupId = body?.groupId;
  const userId = toStringId(user?._id);

  if (!recordingId || !uploadSessionId || !groupId || !Number.isInteger(totalChunks)) {
    throw new Error("recordingId, groupId, uploadSessionId and totalChunks are required.");
  }
  if (!Number.isFinite(durationSec) || durationSec < 0) {
    throw new Error("durationSec must be a valid positive number.");
  }
  if (durationSec > recordingConfig.maxDurationSec) {
    throw new Error("Recording duration exceeds maximum allowed duration.");
  }
  if (!userId) throw new Error("User context is missing.");

  console.log("[screen-recording/complete] start", {
    groupId,
    recordingId,
    uploadSessionId,
    totalChunks,
    durationSec,
  });

  const recording = await ScreenRecording.findOne({
    _id: recordingId,
    groupId,
    uploadSessionId,
    status: "uploading",
  });

  if (!recording) {
    throw new Error("Upload session is invalid or already completed.");
  }

  const receivedChunks = (recording.receivedChunks || []).sort((a: number, b: number) => a - b);
  if (receivedChunks.length < totalChunks) {
    throw new Error("Not all chunks have been uploaded yet.");
  }

  // Validate chunk indices form a continuous sequence [0, 1, ..., totalChunks-1]
  for (let i = 0; i < totalChunks; i++) {
    if (receivedChunks[i] !== i) {
      throw new Error(`Missing chunk at index ${i}. Upload is incomplete or corrupted.`);
    }
  }

  recording.totalChunks = totalChunks;
  // Prefer server-calculated duration from createdAt over client-supplied value
  const serverDurationSec = recording.createdAt
    ? Math.max(0, Math.round((Date.now() - new Date(recording.createdAt).getTime()) / 1000))
    : durationSec;
  recording.durationSec = serverDurationSec;
  recording.sizeBytes = await getSizeFromChunks(recordingId);

  if (recording.sizeBytes > recordingConfig.maxSizeBytes) {
    throw new Error("Recording size exceeds the configured maximum limit.");
  }

  recording.status = "processing";
  await recording.save();

  // Fire and forget processing.
  void processScreenRecordingInBackground(toStringId(recording._id));

  console.log("[screen-recording/complete] processing started", {
    recordingId: toStringId(recording._id),
    status: recording.status,
  });

  return {
    recordingId: toStringId(recording._id),
    status: recording.status,
    totalChunks: recording.totalChunks,
    durationSec: recording.durationSec,
    sizeBytes: recording.sizeBytes,
  };
}

/**
 * GET /screen-recordings/status
 * Returns the current status of a screen recording.
 */
export async function getScreenRecordingStatus(query: any, user: any) {
  const recordingId = query?.recordingId;
  const groupId = query?.groupId;
  const userId = toStringId(user?._id);

  if (!recordingId || !groupId) {
    throw new Error("recordingId and groupId are required.");
  }
  if (!userId) throw new Error("User context is missing.");

  await ensureGroupMemberAccess(groupId, userId);

  const recording = await ScreenRecording.findOne({ _id: recordingId, groupId }).lean();
  if (!recording) throw new Error("Screen recording not found.");

  return recording;
}

/**
 * GET /screen-recordings/list
 * Returns all screen recordings for a group (any group member can view).
 */
export async function getScreenRecordingsList(query: any, user: any) {
  const groupId = query?.groupId;
  const userId = toStringId(user?._id);
  const limit = Math.min(Number(query?.limit) || 20, 100);
  const offset = Number(query?.offset) || 0;

  if (!groupId) throw new Error("groupId is required.");
  if (!userId) throw new Error("User context is missing.");

  await ensureGroupMemberAccess(groupId, userId);

  const recordings = await ScreenRecording.find({ groupId, status: "ready" })
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit)
    .populate("startedBy", "name email image")
    .lean();

  const total = await ScreenRecording.countDocuments({ groupId, status: "ready" });

  return { recordings, total };
}
