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
      emailVerifiedAt: Date,
      authVersion: { type: Number, default: 0 },
      verificationToken: {
        type: new mongoose.Schema(
          { digest: String, expiresAt: Date },
          { _id: false },
        ),
        select: false,
      },
      recoveryToken: {
        type: new mongoose.Schema(
          { digest: String, expiresAt: Date },
          { _id: false },
        ),
        select: false,
      },
      avatarVersion: { type: Number, default: 0 },
      hash: { type: String, required: true, select: false },
    },
    { timestamps: true },
  ),
);
