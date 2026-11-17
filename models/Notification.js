const mongoose = require("mongoose");
const schema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: [
        "message",
        "moderation",
        "report",
        "verification",
        "account",
        "order",
        "search",
      ],
      required: true,
    },
    link: { type: String, required: true },
    event: { type: String, required: true },
    readAt: Date,
  },
  { timestamps: true },
);
schema.index({ user: 1, event: 1 }, { unique: true });
schema.index({ user: 1, createdAt: -1, _id: -1 });
module.exports = mongoose.model("Notification", schema);
