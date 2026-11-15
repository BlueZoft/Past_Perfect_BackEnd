const mongoose = require("mongoose");
const schema = new mongoose.Schema(
  {
    listing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Offer",
      required: true,
    },
    title: { type: String, required: true },
    buyer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);
schema.index({ buyer: 1, listing: 1 }, { unique: true });
schema.index({ buyer: 1, lastMessageAt: -1 });
schema.index({ seller: 1, lastMessageAt: -1 });
module.exports = mongoose.model("Enquiry", schema);
