import Mongoose, { Schema } from "mongoose";

const report = new Schema(
  {
    type: { type: String, 
        enum: {
          values: ["message", "group"],
        }, required: true }, //message or group
    description: { type: String, required: true }, 
    userId: { type: Mongoose.Schema.Types.ObjectId , ref: "users", required: true },
    groupId: { type: Mongoose.Schema.Types.ObjectId , ref: "groups", required: true },
    messageId: { type: Mongoose.Schema.Types.ObjectId , ref: "messages" },
     },
  { timestamps: true, toObject: { virtuals: true }, toJSON: { virtuals: true } }
);

const Report = Mongoose.model("Report", report);

export default Report;

