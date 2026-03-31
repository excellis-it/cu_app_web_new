import Mongoose, { Schema } from "mongoose";

const message = new Schema(
  {
    groupId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Group",
    },
    senderId: {
      type: Mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "users",
    },
    senderName: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    fileName: {
      type: String,
    },
    messageType: {
      type: String,
      enum: {
        values: ["text", "doc", "image", "video", "screen_recording", "created", "added", "removed", "callEnd"],
      },
      trim: true,
      default: "text",
    },
    replyOf: {
      msgId: {
        type: Mongoose.Schema.Types.ObjectId,
      },
      sender: String,
      msg: String,
      msgType: String,
    },
    forwarded: { type: Boolean, default: false },
    allRecipients: [{ type: Mongoose.Schema.Types.ObjectId }],
    deliveredTo: [
      {
        user: { type: Schema.Types.ObjectId, ref: 'users' },
        timestamp: { type: Date, default: null },
      },
    ],
    readBy: [
      {
        user: { type: Schema.Types.ObjectId, ref: 'users' },
        timestamp: { type: Date, default: null },
      },
    ],
    readByAll: {
      type: Boolean,
      default: false
    },
    deliveredToAll: {
      type: Boolean,
      default: false
    },
    deletedBy: [{ type: Mongoose.Schema.Types.ObjectId }],
    timestamp: { type: Date, default: Date.now },
    serial_key: { type: Number, default: 0 },
  },

  { timestamps: true, toObject: { virtuals: true }, toJSON: { virtuals: true } }
);

// Auto-increment serial_key
message.pre("save", async function (next) {
  if (this.isNew) {
    try {
      // Use this.constructor (the Model) to find the last message
      const lastMessage: any = await (this.constructor as any).findOne({}, { serial_key: 1 }).sort({ serial_key: -1 });
      this.serial_key = lastMessage && lastMessage.serial_key ? lastMessage.serial_key + 1 : 1;
      next();
    } catch (error: any) {
      next(error);
    }
  } else {
    next();
  }
});

// Compound index for fetching messages by group (most common query)
message.index({ groupId: 1, createdAt: -1 });
// Index for sender lookups
message.index({ senderId: 1 });
// Index for groupId alone for simpler queries
message.index({ groupId: 1 });
// Index for timestamp-based queries
message.index({ timestamp: -1 });

const Message = Mongoose.model("Message", message);

export default Message;

