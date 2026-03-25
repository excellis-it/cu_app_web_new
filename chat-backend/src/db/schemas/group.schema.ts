import Mongoose, { Schema } from "mongoose";

const group = new Schema(
  {
    groupName: { type: String, required: true },
    groupImage: { type: String },
    groupDescription: { type: String },
    currentUsers: [
      { type: Mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    ],
    admins: [
      { type: Mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    ],
    previousUsers: [
      {
        userId: {
          type: Schema.Types.ObjectId,
          required: true,
        },

        leaveTime: { type: Date },
      },
    ],
    isTemp: { type: Boolean, default: false },
    // NEW: Flag to identify 1:1 direct chats vs group chats
    isDirect: { type: Boolean, default: false },
    createdBy: {
      type: Mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    link: { type: String, default: null },
    pin: { type: String, default: null },
    meetingStartTime: { type: Date, default: null },
    meetingEndTime: { type: Date, default: null },
    createdByTimeZone: { type: String, default: "UTC" },
    googleEventId: { type: String, default: null }, // Google Calendar event ID for synced events
    updatedAt: { type: Date },
    serial_key: { type: Number, default: 0 },
  },
  { timestamps: true, toObject: { virtuals: true }, toJSON: { virtuals: true } }
);

// Auto-increment serial_key
group.pre("save", async function (next) {
  if (this.isNew) {
    try {
      // Use this.constructor (the Model) to find the last group
      const lastGroup: any = await (this.constructor as any).findOne({}, { serial_key: 1 }).sort({ serial_key: -1 });
      this.serial_key = lastGroup && lastGroup.serial_key ? lastGroup.serial_key + 1 : 1;
      next();
    } catch (error: any) {
      next(error);
    }
  } else {
    next();
  }
});

// Index for finding direct chats between two users quickly
group.index({ currentUsers: 1, isDirect: 1 });

const Group = Mongoose.model("Group", group);

export default Group;
