const mongoose = require("mongoose");
const schema = new mongoose.Schema(
  {
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    targetType: {
      type: String,
      enum: ["listing", "user", "message"],
      required: true,
    },
    target: { type: mongoose.Schema.Types.ObjectId, required: true },
    reason: {
      type: String,
      enum: ["scam", "prohibited-item", "harassment", "spam", "other"],
      required: true,
    },
    details: { type: String, maxlength: 2000, default: "" },
    snapshot: { type: String, maxlength: 5000, required: true },
    status: {
      type: String,
      enum: ["open", "resolved", "dismissed"],
      default: "open",
    },
    resolution: { type: String, maxlength: 2000, default: "" },
    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewedAt: Date,
  },
  { timestamps: true },
);
schema.index({ reporter: 1, targetType: 1, target: 1 }, { unique: true });
schema.index({ status: 1, createdAt: 1 });
module.exports = mongoose.model("Report", schema);
