const mongoose = require("mongoose");
module.exports = mongoose.model(
  "JobState",
  new mongoose.Schema(
    { _id: String, afterUser: mongoose.Schema.Types.ObjectId },
    { timestamps: true },
  ),
);
