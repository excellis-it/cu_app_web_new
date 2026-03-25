
import mongoose from "mongoose";

const groupActionSchema = new mongoose.Schema({
    groupId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Group",
        required: true
    },
    action: {
        type: String,
        enum: ["accept", "reject"],
        required: true,
        default: "accept"
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    actionTime: {
        type: Date,
        default: Date.now,

    },
    actionDescription: {
        type: String,
        default: ""
    },
}, {
    timestamps: true, toObject: { virtuals: true }, toJSON: { virtuals: true }
});

groupActionSchema.index({ groupId: 1, action: 1 });

const GroupAction = mongoose.model("GroupAction", groupActionSchema);

export default GroupAction;