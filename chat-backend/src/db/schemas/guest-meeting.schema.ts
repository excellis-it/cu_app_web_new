import Mongoose, { Schema } from "mongoose";

const guestMeeting = new Schema(
    {
        topic: { type: String, required: true }, // Meeting subject
        description: { type: String },

        // Guest info
        guest: [
            {
                name: { type: String, required: true },
                email: { type: String, required: true }
            }
        ],

        // Meeting details
        startTime: { type: Date, required: true },
        endTime: { type: Date, required: true },
        duration: { type: Number }, // in minutes

        // Host info
        hostId: { type: Mongoose.Schema.Types.ObjectId, ref: "users", required: true },

        // Access details
        meetingLink: { type: String }, // Generated link
        pin: { type: String }, // Optional PIN

        status: {
            type: String,
            enum: ['scheduled', 'active', 'completed', 'cancelled'],
            default: 'scheduled'
        },

        // Participant tracking (similar to VideoCall)
        userActivity: [
            {
                user: { type: String }, // Can be User ObjectId or Guest ID
                name: { type: String }, // Display name
                status: {
                    type: String,
                    enum: ["joined", "left"],
                    default: "joined",
                },
                joinedAt: { type: Date, default: Date.now },
                leftAt: { type: Date },
            },
        ],

        startedAt: { type: Date },
        endedAt: { type: Date },

        googleEventId: { type: String }, // For Google Calendar sync

        serial_key: { type: Number, default: 0 },
    },
    { timestamps: true }
);

// Auto-increment serial_key
guestMeeting.pre("save", async function (next) {
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

const GuestMeeting = Mongoose.model("GuestMeeting", guestMeeting);

export default GuestMeeting;
