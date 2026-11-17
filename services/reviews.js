const Offer = require("../models/Offer");
const User = require("../models/User");
const { fail } = require("../lib/http");
const { validateId } = require("./listings");
const orders = require("./orders");
exports.create = async (id, user, input) => {
  const { listing, order } = await orders.read(id, user._id);
  if (String(order.buyer) !== String(user._id))
    throw fail(403, "Only the buyer can review an order");
  if (
    !Number.isSafeInteger(input.version) ||
    input.version < 0 ||
    !Number.isInteger(input.rating) ||
    input.rating < 1 ||
    input.rating > 5 ||
    typeof input.text !== "string" ||
    !input.text.trim() ||
    input.text.trim().length > 2000
  )
    throw fail(
      400,
      "Review requires a rating from 1–5, text up to 2000 characters and current version",
    );
  if (
    order.status !== "completed" ||
    order.paymentMode !== "test" ||
    order.review
  )
    throw fail(409, "Only completed, unreviewed orders can be reviewed");
  const result = await Offer.findOneAndUpdate(
    {
      _id: listing._id,
      orders: {
        $elemMatch: {
          _id: order._id,
          buyer: user._id,
          status: "completed",
          revision: input.version,
          review: { $exists: false },
        },
      },
    },
    {
      $set: {
        "orders.$.review": {
          rating: input.rating,
          text: input.text.trim(),
          createdAt: new Date(),
          hidden: false,
        },
        "orders.$.updatedAt": new Date(),
      },
      $inc: { __v: 1, "orders.$.revision": 1 },
    },
    { new: true, runValidators: true },
  ).select("+orders");
  if (!result) throw fail(409, "Order changed. Reload before trying again.");
  const final = result.orders.id(order._id);
  await orders.notices(final, "review:" + final.revision);
  return final;
};
exports.publicPage = async (id, page, limit) => {
  validateId(id);
  const seller = new (require("mongoose").Types.ObjectId)(id);
  if (!(await User.exists({ _id: seller, suspended: { $ne: true } })))
    throw fail(404, "Seller not found");
  const [result] = await Offer.aggregate([
    { $match: { "orders.seller": seller } },
    { $unwind: "$orders" },
    {
      $match: {
        "orders.seller": seller,
        "orders.status": "completed",
        "orders.paymentMode": "test",
        "orders.review.rating": { $exists: true },
        "orders.review.hidden": { $ne: true },
      },
    },
    {
      $lookup: {
        from: User.collection.name,
        localField: "orders.buyer",
        foreignField: "_id",
        as: "reviewer",
      },
    },
    { $unwind: "$reviewer" },
    { $match: { "reviewer.suspended": { $ne: true } } },
    // Test reviews never become live reputation, even if a deployment changes configuration.
    {
      $project: {
        _id: 0,
        rating: "$orders.review.rating",
        text: "$orders.review.text",
        createdAt: "$orders.review.createdAt",
        test: { $eq: ["$orders.paymentMode", "test"] },
        reviewer: "$reviewer.account.username",
        orderId: "$orders._id",
      },
    },
    { $sort: { createdAt: -1, orderId: -1 } },
    {
      $facet: {
        reviews: [
          { $skip: (page - 1) * limit },
          { $limit: limit },
          { $unset: "orderId" },
        ],
        summary: [
          {
            $group: {
              _id: "$test",
              count: { $sum: 1 },
              average: { $avg: "$rating" },
            },
          },
        ],
      },
    },
  ]);
  const summary = {
    test: { count: 0, average: null },
    live: { count: 0, average: null },
  };
  for (const item of result.summary)
    summary[item._id ? "test" : "live"] = {
      count: item.count,
      average: item.average,
    };
  return {
    reviews: result.reviews,
    summary,
    count: summary.test.count + summary.live.count,
    page,
    limit,
  };
};
exports.adminPage = async (page, limit) => {
  const [result] = await Offer.aggregate([
    { $match: { "orders.review.rating": { $exists: true } } },
    { $unwind: "$orders" },
    { $match: { "orders.review.rating": { $exists: true } } },
    {
      $project: {
        _id: "$orders._id",
        buyer: "$orders.buyer",
        seller: "$orders.seller",
        title: "$orders.title",
        status: "$orders.status",
        revision: "$orders.revision",
        review: "$orders.review",
        paymentMode: "$orders.paymentMode",
      },
    },
    { $sort: { "review.createdAt": -1, _id: -1 } },
    {
      $facet: {
        reviews: [{ $skip: (page - 1) * limit }, { $limit: limit }],
        count: [{ $count: "count" }],
      },
    },
  ]);
  return {
    reviews: result.reviews,
    count: result.count[0]?.count || 0,
    page,
    limit,
  };
};
exports.moderate = async (id, user, input) => {
  validateId(id);
  if (
    !Number.isSafeInteger(input.version) ||
    input.version < 0 ||
    typeof input.hidden !== "boolean" ||
    typeof input.reason !== "string" ||
    !input.reason.trim() ||
    input.reason.trim().length > 1000
  )
    throw fail(
      400,
      "Review moderation requires version, visibility and reason",
    );
  const listing = await Offer.findOne({ "orders._id": id }).select("+orders");
  const order = listing?.orders.id(id);
  if (!order?.review) throw fail(404, "Review not found");
  if (
    [order.buyer, order.seller].some(
      (actor) => String(actor) === String(user._id),
    )
  )
    throw fail(403, "Administrators cannot moderate their own order reviews");
  const result = await Offer.findOneAndUpdate(
    {
      _id: listing._id,
      orders: { $elemMatch: { _id: order._id, revision: input.version } },
    },
    {
      $set: { "orders.$.review.hidden": input.hidden },
      $push: {
        "orders.$.review.moderation": {
          $each: [
            {
              actor: user._id,
              hidden: input.hidden,
              reason: input.reason.trim(),
              at: new Date(),
            },
          ],
          $slice: -10,
        },
      },
      $inc: { __v: 1, "orders.$.revision": 1 },
    },
    { new: true, runValidators: true },
  ).select("+orders");
  if (!result) throw fail(409, "Order changed. Reload before trying again.");
  const final = result.orders.id(id);
  await orders.notices(final, "review-moderation:" + final.revision);
  return { _id: final._id, revision: final.revision, review: final.review };
};
