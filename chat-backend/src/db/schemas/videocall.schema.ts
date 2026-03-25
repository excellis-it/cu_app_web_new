import mongoose, { Schema } from "mongoose";

const videoCallSchema = new Schema({
  groupId: {
    type: String,
    default: null,
  },
  userActivity: [
    {
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Users",
        default: null,
      },
      status: {
        type: String,
        enum: ["joined", "left", "invited"],
        default: "joined",
      },
      joinedAt: {
        type: Date,
        default: Date.now,
      },
      leftAt: {
        type: Date,
        default: Date.now,  
      },
    },
  ],
  status: {
    type: String,
    enum: ["active", "ended"],
    default: "active",
  },
  callType: {
    type: String,
    enum: ["audio", "video"],
    default: "video",
  },
  incommingCall: {
    type: Boolean,
    default: false,
  },
  startedAt: {
    type: Date,
    default: Date.now,
  },
  endedAt: {
    type: Date,
  },
}, { timestamps: true });

// Add a unique compound index to prevent multiple active calls for the same group
videoCallSchema.index({ groupId: 1, status: 1 }, { 
  unique: true, 
  partialFilterExpression: { status: "active" }
});

// Add an index for faster queries
videoCallSchema.index({ groupId: 1 });

const VideoCall = mongoose.model("VideoCall", videoCallSchema);

export default VideoCall;

