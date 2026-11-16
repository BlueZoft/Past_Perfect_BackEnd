const mongoose = require("mongoose");
const orderSchema = new mongoose.Schema({
  buyer: { type: mongoose.Schema.Types.ObjectId, required: true },
  seller: { type: mongoose.Schema.Types.ObjectId, required: true },
  listingId: { type: mongoose.Schema.Types.ObjectId, required: true },
  title: String,
  itemMinor: Number,
  platformFeeMinor: Number,
  deliveryMinor: Number,
  totalMinor: Number,
  currency: { type: String, enum: ["LKR"] },
  requestKey: String,
  requestedListingVersion: Number,
  status: {
    type: String,
    enum: [
      "awaiting_payment",
      "confirmed",
      "payment_failed",
      "cancelled",
      "expired",
      "ready",
      "completed",
      "disputed",
      "refunded",
    ],
    required: true,
  },
  revision: { type: Number, default: 0 },
  expiresAt: Date,
  createdAt: Date,
  updatedAt: Date,
  fulfilment: { type: String, enum: ["collection"] },
  paymentMode: String,
  paymentReference: String,
  dispute: {
    type: new mongoose.Schema(
      {
        status: {
          type: String,
          enum: ["open", "refunded", "declined"],
          required: true,
        },
        previousStatus: {
          type: String,
          enum: ["confirmed", "ready", "completed"],
          required: true,
        },
        reason: { type: String, maxlength: 2000, required: true },
        openedBy: mongoose.Schema.Types.ObjectId,
        openedAt: Date,
        response: { type: String, maxlength: 2000 },
        respondedAt: Date,
        resolution: { type: String, maxlength: 2000 },
        resolvedBy: mongoose.Schema.Types.ObjectId,
        resolvedAt: Date,
        refundMinor: Number,
        refundReference: String,
      },
      { _id: false },
    ),
    default: undefined,
  },
});
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
    attributes: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
    category: {
      type: String,
      enum: require("../lib/catalogue").catalogue.categories,
      default: "other",
    },
    district: { type: String, default: "" },
    town: { type: String, default: "" },
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
    images: [
      {
        url: String,
        publicId: String,
        width: Number,
        height: Number,
        bytes: Number,
        driver: { type: String, enum: ["local", "cloudinary"] },
      },
    ],
    status: {
      type: String,
      enum: ["active", "reserved", "sold", "removed"],
      default: "active",
    },
    orders: { type: [orderSchema], select: false, default: () => [] },
    reservation: {
      type: new mongoose.Schema(
        { orderId: mongoose.Schema.Types.ObjectId, expiresAt: Date },
        { _id: false },
      ),
      select: false,
    },
    orderLock: { type: Boolean, default: false },
    policyReview: { type: Boolean, default: false },
    policyVersion: String,
    policyRuleIds: [String],
    moderationHidden: { type: Boolean, default: false },
    moderationAudit: {
      type: [
        {
          actor: mongoose.Schema.Types.ObjectId,
          hidden: Boolean,
          reason: String,
          at: Date,
        },
      ],
      select: false,
    },
    removedAt: Date,
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);
schema.index(
  { title: "text", description: "text" },
  {
    name: "listing_keywords",
    default_language: "none",
    weights: { title: 4, description: 1 },
  },
);
schema.index({ category: 1, district: 1, town: 1, status: 1, createdAt: -1 });
schema.index({ status: 1, createdAt: -1, _id: -1 });
schema.index({ owner: 1, status: 1, createdAt: -1, _id: -1 });
schema.index(
  { "orders.buyer": 1, "orders.requestKey": 1 },
  {
    unique: true,
    partialFilterExpression: { "orders.requestKey": { $exists: true } },
  },
);
schema.index({ orderLock: 1, "reservation.expiresAt": 1 });
schema.index({ "orders.dispute.status": 1, "orders.dispute.openedAt": -1 });
module.exports = mongoose.model("Offer", schema);
