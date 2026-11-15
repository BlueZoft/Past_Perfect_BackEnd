const mongoose = require("mongoose");
const schema = new mongoose.Schema(
  {
    enquiry: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Enquiry",
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    text: { type: String, required: true, maxlength: 2000 },
  },
  { timestamps: true },
);
schema.index({ enquiry: 1, createdAt: 1, _id: 1 });
module.exports = mongoose.model("Message", schema);
