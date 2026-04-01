import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

import Group from "../../db/schemas/group.schema";
import VideoCall from "../../db/schemas/videocall.schema";
import CallRecording from "../../db/schemas/callrecording.schema";

import { recordingConfig, ensureRecordingTempDirectory } from "../../helpers/recordingConfig";
import { processRecordingInBackground } from "../../helpers/recordingProcessor";
import ScreenRecording from "../../db/schemas/screen-recording.schema";

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

async function ensureAdminAccess(groupId: string, userId: string) {
  const group = await Group.findById(groupId, { admins: 1 }).lean();
  if (!group?.admins?.some((adminId: any) => toStringId(adminId) === userId)) {
    throw new Error("Only group admins can perform recording actions.");
  }
}

async function ensureGroupMemberAccess(groupId: string, userId: string) {
  const group = await Group.findById(groupId, { currentUsers: 1 }).lean();
  if (!group?.currentUsers?.some((memberId: any) => toStringId(memberId) === userId)) {
    throw new Error("You are not allowed to access this recording.");
  }
}

function getRecordingDir(recordingId: string) {
  return path.join(recordingConfig.tempUploadDir, recordingId);
}

function getChunksDir(recordingId: string) {
  return path.join(getRecordingDir(recordingId), "chunks");
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

export async function initRecordingUpload(body: any, user: any) {
  ensureRecordingTempDirectory();

  const roomId = body?.roomId;
  const recordingId = body?.recordingId;
  const mimeType = body?.mimeType || null;
  const userId = toStringId(user?._id);

  if (!roomId || !recordingId) {
    throw new Error("roomId and recordingId are required.");
  }
  if (mimeType && !ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error(`Unsupported mimeType: ${mimeType}. Allowed: ${[...ALLOWED_MIME_TYPES].join(", ")}`);
  }
  if (!userId) {
    throw new Error("User context is missing.");
  }

  // eslint-disable-next-line no-console
  console.log("[recordings:init] start", {
    roomId,
    recordingId,
    userId,
    mimeType,
  });

  await ensureAdminAccess(roomId, userId);

  const activeCall = await VideoCall.findOne({ groupId: roomId, status: "active" }, { _id: 1 }).lean();
  if (!activeCall?._id) {
    throw new Error("No active call found for this room.");
  }
  // eslint-disable-next-line no-console
  console.log("[recordings:init] activeCall", { activeCallId: toStringId(activeCall._id) });

  const uploadSessionId = crypto.randomUUID();

  // Atomic update: only set uploadSessionId if it hasn't been set yet (prevents concurrent init race)
  const recording = await CallRecording.findOneAndUpdate(
    {
      _id: recordingId,
      groupId: roomId,
      callId: activeCall._id,
      uploadSessionId: null,
    },
    {
      $set: {
        uploadSessionId,
        status: "uploading",
        mimeType,
      },
    },
    { new: true },
  );

  if (!recording) {
    throw new Error("Recording session not found or upload already initialized.");
  }

  // eslint-disable-next-line no-console
  console.log("[recordings:init] ok", {
    roomId,
    recordingId: toStringId(recording._id),
    uploadSessionId,
    status: recording.status,
  });

  const chunksDir = getChunksDir(recordingId);
  await fsp.mkdir(chunksDir, { recursive: true });

  return {
    recordingId: toStringId(recording._id),
    uploadSessionId,
    status: recording.status,
    maxDurationSec: recordingConfig.maxDurationSec,
    maxSizeBytes: recordingConfig.maxSizeBytes,
    maxChunkSizeBytes: recordingConfig.maxChunkSizeBytes,
  };
}

export async function uploadRecordingChunk(body: any, user: any, file: any) {
  ensureRecordingTempDirectory();

  const recordingId = body?.recordingId;
  const uploadSessionId = body?.uploadSessionId;
  const chunkIndex = Number(body?.chunkIndex);
  const roomId = body?.roomId;
  const userId = toStringId(user?._id);

  const chunkBuffer: Buffer | undefined = file?.buffer;
  const chunkBytes = chunkBuffer?.length || 0;

  if (!recordingId || !uploadSessionId || !roomId || !Number.isInteger(chunkIndex)) {
    throw new Error("recordingId, roomId, uploadSessionId and chunkIndex are required.");
  }
  if (!chunkBuffer || !chunkBytes) {
    throw new Error("chunk file is required.");
  }

  if (!userId) throw new Error("User context is missing.");

  // eslint-disable-next-line no-console
  console.log("[recordings/chunk] recv", {
    roomId,
    recordingId,
    uploadSessionId,
    chunkIndex,
    chunkBytes,
    userId,
  });

  await ensureAdminAccess(roomId, userId);

  if (chunkBytes > recordingConfig.maxChunkSizeBytes) {
    throw new Error("Chunk exceeds maximum allowed size.");
  }

  const recording = await CallRecording.findOne({
    _id: recordingId,
    groupId: roomId,
    uploadSessionId,
    status: "uploading",
  });

  if (!recording) {
    const dbDoc: any = await CallRecording.findById(recordingId).lean();
    // eslint-disable-next-line no-console
    console.error("[recordings/chunk] DIAGNOSTIC – session not found", {
      query: { recordingId, roomId, uploadSessionId, status: "uploading" },
      dbDoc: dbDoc
        ? {
          _id: String(dbDoc._id),
          groupId: dbDoc.groupId,
          uploadSessionId: dbDoc.uploadSessionId,
          status: dbDoc.status,
          callId: String(dbDoc.callId ?? ""),
        }
        : "NO_DOCUMENT_AT_ALL",
      fieldMatch: dbDoc
        ? {
          id: String(dbDoc._id) === String(recordingId),
          groupId: dbDoc.groupId === roomId,
          uploadSessionId: dbDoc.uploadSessionId === uploadSessionId,
          status: dbDoc.status === "uploading",
        }
        : null,
    });
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

  // eslint-disable-next-line no-console
  console.log("[recordings/chunk] wrote", { chunkPath });

  const received = new Set(recording.receivedChunks || []);
  received.add(chunkIndex);
  recording.receivedChunks = [...received].sort((a, b) => a - b);
  recording.sizeBytes = await getSizeFromChunks(recordingId);

  if (recording.sizeBytes > recordingConfig.maxSizeBytes) {
    throw new Error("Recording size exceeds the configured maximum limit.");
  }

  await recording.save();

  // eslint-disable-next-line no-console
  console.log("[recordings/chunk] updated", {
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

export async function completeRecordingUpload(body: any, user: any) {
  ensureRecordingTempDirectory();

  const recordingId = body?.recordingId;
  const uploadSessionId = body?.uploadSessionId;
  const totalChunks = Number(body?.totalChunks);
  const durationSec = Number(body?.durationSec || 0);
  const roomId = body?.roomId;
  const userId = toStringId(user?._id);

  if (!recordingId || !uploadSessionId || !roomId || !Number.isInteger(totalChunks)) {
    throw new Error("recordingId, roomId, uploadSessionId and totalChunks are required.");
  }
  if (!Number.isFinite(durationSec) || durationSec < 0) {
    throw new Error("durationSec must be a valid positive number.");
  }
  if (durationSec > recordingConfig.maxDurationSec) {
    throw new Error("Recording duration exceeds maximum allowed duration.");
  }
  if (!userId) throw new Error("User context is missing.");

  // eslint-disable-next-line no-console
  console.log("[recordings/complete] start", {
    roomId,
    recordingId,
    uploadSessionId,
    totalChunks,
    durationSec,
    userId,
  });

  await ensureAdminAccess(roomId, userId);

  const recording = await CallRecording.findOne({
    _id: recordingId,
    groupId: roomId,
    uploadSessionId,
    status: "uploading",
  });

  if (!recording) {
    throw new Error("Upload session is invalid or already completed.");
  }

  // eslint-disable-next-line no-console
  console.log("[recordings/complete] before complete", {
    receivedChunks: (recording.receivedChunks || []).length,
    status: recording.status,
    sizeBytes: recording.sizeBytes,
  });

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
  void processRecordingInBackground(toStringId(recording._id));

  // eslint-disable-next-line no-console
  console.log("[recordings/complete] processing started", {
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

export async function checkRecordingOngoing(query: any, user: any) {
  const groupId = query?.groupId;
  const userId = toStringId(user?._id);

  if (!groupId) {
    throw new Error("groupId is required.");
  }
  if (!userId) throw new Error("User context is missing.");

  await ensureGroupMemberAccess(groupId, userId);

  const ongoingRecording = await ScreenRecording.findOne(
    { groupId, status: "recording" },
    { _id: 1, groupId: 1, callId: 1, startedBy: 1, status: 1, createdAt: 1 },
  ).lean();

  return {
    isRecording: !!ongoingRecording,
    recording: ongoingRecording || null,
  };
}

export async function getRecordingStatus(query: any, user: any) {
  const recordingId = query?.recordingId;
  const roomId = query?.roomId;
  const userId = toStringId(user?._id);

  if (!recordingId || !roomId) {
    throw new Error("recordingId and roomId are required.");
  }

  if (!userId) throw new Error("User context is missing.");

  await ensureGroupMemberAccess(roomId, userId);

  const recording = await CallRecording.findOne({ _id: recordingId, groupId: roomId }).lean();
  if (!recording) throw new Error("Recording not found.");

  return recording;
}

