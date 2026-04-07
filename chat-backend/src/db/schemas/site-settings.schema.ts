import Mongoose, { Schema } from "mongoose";

const siteSettings = new Schema(
  {
    siteName: { type: String, required: true },
    siteLogo: { type: String },
    siteDescription: { type: String },
    siteMainImage: { type: String },
    primaryColor: { type: String, default: '#1da678' },
    secondaryColor: { type: String, default: '#35a200' },
    accentColor: { type: String, default: '#ff6b6b' },
    backgroundColor: { type: String, default: '#ffffff' },
    updatedAt: { type: Date },
  },
  { timestamps: true, toObject: { virtuals: true }, toJSON: { virtuals: true } }
);

const SiteSettings = Mongoose.model("SiteSettings", siteSettings);

export default SiteSettings;

