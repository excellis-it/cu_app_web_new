import mongoose, { Mongoose, Schema } from "mongoose";

const userSchema = new mongoose.Schema({
    sl: {
        type: Number,
        required: true,
        unique: true,
    },
    name: {
        type: String,
        required: true,
        unique: false,
    },
    image: {
        type: String,
        required: false,
        unique: false,
    },
    userName: {
        type: String,
        required: false,
        unique: false,
    },
    email: {
        type: String,
        required: true,
    },
    password: {
        type: String,
        required: false,

    },
    phone: {
        type: String,
        required: false,
    },
    connectedDevices: [{
        type: String,
        required: false,
    }],
    connectedDevicesCount: {
        type: Number,
        required: false,
    },
    firebaseToken: {
        type: String,
        required: false,
    },
    applePushToken: {
        type: String,
        required: false,
    },
    webPushToken: {
        type: String,
        required: false,
    },
    userType: {
        type: String,
        required: true,
        enum: ["admin", "SuperAdmin", "user"],

    },
    added_member_by: [{
        type: Schema.Types.ObjectId,
        required: true,
        ref: "users",
    }],
    accountStatus: {
        type: String,
        required: true,
        enum: ["Active", "Inactive", "Deleted"],
        default: "Active",
    },
    isActiveInCall: {
        type: Boolean,
        required: false,
        default: false,
    },
    applePushUnique: {
        type: String,
        default: "",
    },
    forgetPassword: {
        type: Schema.Types.Mixed
    },
    googleTokens: {
        access_token: String,
        refresh_token: String,
        scope: String,
        token_type: String,
        expiry_date: Number,
    },
    createdAt: {
        type: Date,
        required: true,
        default: Date.now,
    },
    serial_key: {
        type: Number,
        required: false,
    },
});

userSchema.index({ serial_key: 1 }, { unique: true });
userSchema.index({ email: 1 }, { unique: true });
// Auto-increment serial_key
userSchema.pre("save", async function (next) {
    if (this.isNew) {
        try {
            // Use this.constructor (the Model) to find the last user
            const lastUser: any = await (this.constructor as any).findOne({}, { serial_key: 1 }).sort({ serial_key: -1 });
            this.serial_key = lastUser && lastUser.serial_key ? lastUser.serial_key + 1 : 1;
            next();
        } catch (error: any) {
            next(error);
        }
    } else {
        next();
    }
});

const USERS = mongoose.model("users", userSchema);
export default USERS;