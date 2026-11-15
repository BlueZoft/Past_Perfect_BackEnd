const mongoose = require("mongoose");
const schema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    listing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Offer",
      required: true,
    },
  },
  { timestamps: true },
);
schema.index({ user: 1, listing: 1 }, { unique: true });
module.exports = mongoose.model("Favourite", schema);
