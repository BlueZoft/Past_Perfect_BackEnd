const mongoose = require("mongoose");
const schema = new mongoose.Schema(
  {
    publicId: { type: String, required: true },
    driver: { type: String, enum: ["local", "cloudinary"], required: true },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true },
);
schema.index({ driver: 1, publicId: 1 }, { unique: true });
module.exports = mongoose.model("AssetCleanup", schema);
