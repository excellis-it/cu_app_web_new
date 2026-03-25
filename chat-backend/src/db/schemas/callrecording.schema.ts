import mongoose, { Schema } from "mongoose";

const callRecordingSchema = new Schema(
  {
    groupId: {
      type: String,
      required: true,
      index: true,
    },
    callId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VideoCall",
      required: false,
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

// Query latest recordings for a group quickly.
callRecordingSchema.index({ groupId: 1, createdAt: -1 });

// Ensure only one in-progress recording exists for a call.
// (If callId is unknown, we still prevent duplicates by groupId at the controller layer.)
callRecordingSchema.index(
  { callId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["recording", "uploading", "processing"] },
    },
  },
);

const CallRecording = mongoose.model("CallRecording", callRecordingSchema);
export default CallRecording;

