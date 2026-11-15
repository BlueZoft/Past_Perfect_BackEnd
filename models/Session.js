const mongoose = require("mongoose");
module.exports = mongoose.model(
  "Session",
  new mongoose.Schema({
    authVersion: { type: Number, default: 0 },
    digest: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    expiresAt: { type: Date, required: true, expires: 0 },
  }),
);
