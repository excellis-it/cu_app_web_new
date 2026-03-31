import mongoose, { Schema } from "mongoose";

const screenRecordingSchema = new Schema(
  {
    groupId: {
      type: String,
      required: true,
      index: true,
    },
    startedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      required: true,
    },
    status: {
      type: String,
      enum: ["recording", "uploading", "processing", "ready", "failed"],
      default: "recording",
      required: true,
    },
    mimeType: {
      type: String,
      default: null,
    },
    durationSec: {
      type: Number,
      default: 0,
    },
    sizeBytes: {
      type: Number,
      default: 0,
    },
    uploadSessionId: {
      type: String,
      default: null,
    },
    totalChunks: {
      type: Number,
      default: 0,
    },
    receivedChunks: {
      type: [Number],
      default: [],
    },
    rawFilePath: {
      type: String,
      default: null,
    },
    rawObjectKey: {
      type: String,
      default: null,
    },
    playbackUrl: {
      type: String,
      default: null,
    },
    errorMessage: {
      type: String,
      default: null,
    },
  },
  { timestamps: true },
);

// Query latest screen recordings for a group quickly.
screenRecordingSchema.index({ groupId: 1, createdAt: -1 });

// Ensure only one in-progress screen recording exists per group.
screenRecordingSchema.index(
  { groupId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["recording", "uploading", "processing"] },
    },
  },
);

const ScreenRecording = mongoose.model("ScreenRecording", screenRecordingSchema);
export default ScreenRecording;