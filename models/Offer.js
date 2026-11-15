const mongoose = require("mongoose");
const schema = new mongoose.Schema(
  {
    title: { type: String, required: true, minlength: 3, maxlength: 120 },
    description: {
      type: String,
      required: true,
      minlength: 10,
      maxlength: 4000,
    },
    price: { type: Number, required: true, min: 1, max: 1000000000 },
    currency: { type: String, enum: ["LKR"], default: "LKR" },
    size: {
      type: String,
      enum: ["", "XS", "S", "M", "L", "XL", "XXL"],
      default: "",
    },
    condition: {
      type: String,
      required: true,
      enum: ["New with Tags", "Like New", "Fairly Used", "Used", "Worn"],
    },
    images: [{ url: String, publicId: String }],
    status: {
      type: String,
      enum: ["active", "reserved", "sold", "removed"],
      default: "active",
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);
schema.index({ status: 1, createdAt: -1, _id: -1 });
schema.index({ owner: 1, status: 1, createdAt: -1, _id: -1 });
module.exports = mongoose.model("Offer", schema);
