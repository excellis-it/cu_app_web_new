
import Mongoose, { Schema } from "mongoose";

const guestMeetingMessage = new Schema(
    {
        meetingId: { type: Mongoose.Schema.Types.ObjectId, ref: "GuestMeeting", required: true },
        sender: { type: String, required: true }, // Email or internal ID
        senderId: { type: String }, // User Object ID if logged in
        senderName: { type: String }, // Human readable name for display
        content: { type: String, required: true },
        type: { type: String, enum: ["text", "file"], default: "text" },
        fileUrl: { type: String, default: "" },
        fileName: { type: String, default: "" },
        fileSize: { type: Number, default: 0 },
        status: { type: String, enum: ["sent", "delivered", "read"], default: "sent" },
        readBy: [{ type: String }], // User IDs who read the message
        deliveredTo: [{ type: String }], // User IDs who received the message
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now },
        serial_key: { type: Number, default: 0 },
    },
    { timestamps: true }
);

// Auto-increment serial_key
guestMeetingMessage.pre("save", async function (next) {
    if (this.isNew) {
        try {
            const lastMeeting: any = await (this.constructor as any).findOne({}, { serial_key: 1 }).sort({ serial_key: -1 });
            this.serial_key = lastMeeting && lastMeeting.serial_key ? lastMeeting.serial_key + 1 : 1;
            next();
        } catch (error: any) {
            next(error);
        }
    } else {
        next();
    }
});

const GuestMeetingMessage = Mongoose.model("GuestMeetingMessage", guestMeetingMessage);

export default GuestMeetingMessage;