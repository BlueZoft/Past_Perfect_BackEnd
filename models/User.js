const mongoose = require("mongoose");
module.exports = mongoose.model(
  "User",
  new mongoose.Schema(
    {
      email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
      },
      account: {
        username: { type: String, required: true, maxlength: 80 },
        avatar: Object,
        bio: { type: String, maxlength: 1000, default: "" },
      },
      avatarVersion: { type: Number, default: 0 },
      hash: { type: String, required: true, select: false },
    },
    { timestamps: true },
  ),
);
