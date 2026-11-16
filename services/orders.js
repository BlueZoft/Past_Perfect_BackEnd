const mongoose = require("mongoose");
const Offer = require("../models/Offer");
const User = require("../models/User");
const Block = require("../models/Block");
const config = require("./orderConfig");
const { fail } = require("../lib/http");
const { validateId } = require("./listings");
const { notify } = require("./notifications");
const own = (order, user) =>
  String(order.buyer) === String(user) || String(order.seller) === String(user);
exports.read = async (id, user) => {
  validateId(id);
  id = id.toLowerCase();
  const listing = await Offer.findOne({ "orders._id": id }).select(
    "+orders +reservation",
  );
  const order = listing?.orders.find((item) => String(item._id) === id);
  if (!order || !own(order, user)) throw fail(404, "Order not found");
  return { listing, order };
};
async function notices(order, event) {
  await Promise.all([
    notify(
      order.buyer,
      "order",
      "/orders/" + order._id,
      "order:" + order._id + ":" + event,
    ),
    notify(
      order.seller,
      "order",
      "/orders/" + order._id,
      "order:" + order._id + ":" + event,
    ),
  ]);
}
exports.expire = async (id) => {
  const now = new Date();
  const listing = await Offer.findOne({
    _id: id,
    orderLock: true,
    "reservation.expiresAt": { $lte: now },
  }).select("+orders +reservation");
  if (!listing) return false;
  const order = listing.orders.find(
    (item) =>
      String(item._id) === String(listing.reservation.orderId) &&
      item.status === "awaiting_payment",
  );
  if (!order) return false;
  const result = await Offer.updateOne(
    {
      _id: id,
      orderLock: true,
      "reservation.orderId": order._id,
      "reservation.expiresAt": { $lte: now },
      orders: {
        $elemMatch: {
          _id: order._id,
          status: "awaiting_payment",
          revision: order.revision,
        },
      },
    },
    {
      $set: {
        status: "active",
        orderLock: false,
        "orders.$.status": "expired",
        "orders.$.updatedAt": now,
      },
      $unset: { reservation: "" },
      $inc: { __v: 1, "orders.$.revision": 1 },
    },
  );
  if (result.modifiedCount) await notices(order, "expired");
  return !!result.modifiedCount;
};
exports.expireBatch = async (filter = {}) => {
  const items = await Offer.find({
    ...filter,
    orderLock: true,
    "reservation.expiresAt": { $lte: new Date() },
  })
    .select("_id")
    .limit(100);
  let expired = 0;
  for (const item of items) if (await exports.expire(item._id)) expired++;
  return expired;
};
async function available(id, buyer) {
  validateId(id);
  await exports.expire(id);
  const listing = await Offer.findOne({
    _id: id,
    status: "active",
    orderLock: { $ne: true },
    moderationHidden: { $ne: true },
  });
  if (
    !listing ||
    !(await User.exists({ _id: listing.owner, suspended: { $ne: true } }))
  )
    throw fail(404, "Available listing not found");
  if (String(listing.owner) === String(buyer))
    throw fail(400, "You cannot order your own listing");
  if (
    await Block.exists({
      $or: [
        { user: buyer, blocked: listing.owner },
        { user: listing.owner, blocked: buyer },
      ],
    })
  )
    throw fail(403, "Orders are unavailable between these accounts");
  return listing;
}
function amounts(listing) {
  const settings = config.current();
  const itemMinor = listing.price * 100;
  const totalMinor = itemMinor + settings.platformFeeMinor;
  if (!Number.isSafeInteger(itemMinor) || !Number.isSafeInteger(totalMinor))
    throw fail(409, "Listing price is invalid");
  return {
    itemMinor,
    platformFeeMinor: settings.platformFeeMinor,
    deliveryMinor: 0,
    totalMinor,
    currency: "LKR",
  };
}
exports.quote = async (id, user) => {
  const listing = await available(id, user._id);
  return {
    listingId: listing._id,
    title: listing.title,
    listingVersion: listing.__v,
    ...amounts(listing),
    ...config.current(),
  };
};
function sameRequest(order, input) {
  if (
    order.requestedListingVersion !== input.listingVersion ||
    order.totalMinor !== input.expectedTotalMinor
  )
    throw fail(409, "Idempotency key was used for a different request");
}
exports.create = async (input, user) => {
  config.requireTest();
  await Offer.init();
  if (!user.emailVerifiedAt)
    throw fail(403, "Verify your email before ordering");
  validateId(input.listingId);
  if (
    !Number.isSafeInteger(input.listingVersion) ||
    input.listingVersion < 0 ||
    !Number.isSafeInteger(input.expectedTotalMinor) ||
    input.expectedTotalMinor < 1 ||
    typeof input.idempotencyKey !== "string" ||
    !/^[a-zA-Z0-9_-]{16,80}$/.test(input.idempotencyKey)
  )
    throw fail(400, "Invalid order request");
  const findReplay = () =>
    Offer.findOne({
      _id: input.listingId,
      orders: {
        $elemMatch: { buyer: user._id, requestKey: input.idempotencyKey },
      },
    }).select("+orders");
  let replay = await findReplay();
  if (replay) {
    const order = replay.orders.find(
      (item) =>
        String(item.buyer) === String(user._id) &&
        item.requestKey === input.idempotencyKey,
    );
    sameRequest(order, input);
    await exports.expire(input.listingId);
    return {
      order: (await exports.read(String(order._id), user._id)).order,
      replayed: true,
    };
  }
  const listing = await available(input.listingId, user._id),
    totals = amounts(listing);
  if (
    listing.__v !== input.listingVersion ||
    totals.totalMinor !== input.expectedTotalMinor
  )
    throw fail(409, "Quote changed. Reload before ordering");
  if (
    (await Offer.findById(listing._id).select("+orders")).orders.length >= 100
  )
    throw fail(409, "Order history limit reached for this listing");
  const order = {
    _id: new mongoose.Types.ObjectId(),
    buyer: user._id,
    seller: listing.owner,
    listingId: listing._id,
    title: listing.title,
    ...totals,
    requestKey: input.idempotencyKey,
    requestedListingVersion: input.listingVersion,
    status: "awaiting_payment",
    revision: 0,
    expiresAt: new Date(Date.now() + config.current().holdMinutes * 60000),
    createdAt: new Date(),
    updatedAt: new Date(),
    fulfilment: "collection",
  };
  let updated;
  try {
    updated = await Offer.findOneAndUpdate(
      {
        _id: listing._id,
        __v: input.listingVersion,
        status: "active",
        moderationHidden: { $ne: true },
        orderLock: { $ne: true },
        "orders.99": { $exists: false },
      },
      {
        $set: {
          status: "reserved",
          orderLock: true,
          reservation: { orderId: order._id, expiresAt: order.expiresAt },
        },
        $push: { orders: order },
        $inc: { __v: 1 },
      },
      { new: true, runValidators: true },
    ).select("+orders");
  } catch (err) {
    if (err.code === 11000)
      throw fail(409, "Idempotency key was used for a different request");
    throw err;
  }
  if (!updated) {
    replay = await findReplay();
    const existing = replay?.orders.find(
      (item) =>
        String(item.buyer) === String(user._id) &&
        item.requestKey === input.idempotencyKey,
    );
    if (existing) {
      sameRequest(existing, input);
      return { order: existing, replayed: true };
    }
    throw fail(409, "Listing was reserved or changed. Reload before ordering");
  }
  await notices(order, "created");
  return {
    order: updated.orders.find(
      (item) => String(item._id) === String(order._id),
    ),
    replayed: false,
  };
};
exports.action = async (id, user, action, revision) => {
  id = id.toLowerCase();
  if (!Number.isSafeInteger(revision) || revision < 0)
    throw fail(400, "A valid order version is required");
  let { listing, order } = await exports.read(id, user._id);
  await exports.expire(listing._id);
  ({ listing, order } = await exports.read(id, user._id));
  if (order.revision !== revision)
    throw fail(409, "Order changed. Reload before trying again.");
  let next,
    release = false,
    sold = false;
  if (action === "cancel" && order.status === "awaiting_payment") {
    next = "cancelled";
    release = true;
  } else if (["test-success", "test-failure"].includes(action)) {
    config.requireTest();
    if (String(order.buyer) !== String(user._id))
      throw fail(403, "Only the buyer can test payment");
    if (order.status !== "awaiting_payment")
      throw fail(409, "Order cannot accept payment");
    if (
      !(await User.exists({ _id: order.seller, suspended: { $ne: true } })) ||
      listing.moderationHidden
    )
      throw fail(409, "Seller or listing is unavailable. Cancel this order");
    if (
      await Block.exists({
        $or: [
          { user: order.buyer, blocked: order.seller },
          { user: order.seller, blocked: order.buyer },
        ],
      })
    )
      throw fail(403, "Orders are unavailable between these accounts");
    next = action === "test-success" ? "confirmed" : "payment_failed";
    release = next === "payment_failed";
    sold = !release;
  } else if (
    action === "ready" &&
    String(order.seller) === String(user._id) &&
    order.status === "confirmed"
  )
    next = "ready";
  else if (
    action === "complete" &&
    String(order.buyer) === String(user._id) &&
    order.status === "ready"
  ) {
    next = "completed";
    release = true;
    sold = true;
  } else throw fail(409, "Invalid order action");
  const set = { "orders.$.status": next, "orders.$.updatedAt": new Date() };
  if (action.startsWith("test-")) {
    set["orders.$.paymentMode"] = "test";
    set["orders.$.paymentReference"] = "test-" + order._id;
  }
  if (release) {
    set.orderLock = false;
    set.status = sold ? "sold" : "active";
  } else if (sold) set.status = "sold";
  const query = {
    _id: listing._id,
    orderLock: true,
    "reservation.orderId": order._id,
    orders: { $elemMatch: { _id: order._id, revision, status: order.status } },
  };
  if (action.startsWith("test-")) query.moderationHidden = { $ne: true };
  if (order.status === "awaiting_payment")
    query["reservation.expiresAt"] = { $gt: new Date() };
  const result = await Offer.findOneAndUpdate(
    query,
    {
      $set: set,
      $inc: { __v: 1, "orders.$.revision": 1 },
      ...(release
        ? { $unset: { reservation: "" } }
        : next === "confirmed"
          ? { $unset: { "reservation.expiresAt": "" } }
          : {}),
    },
    { new: true, runValidators: true },
  ).select("+orders");
  if (!result)
    throw fail(409, "Order changed or expired. Reload before trying again.");
  const final = result.orders.find((item) => String(item._id) === id);
  await notices(final, next);
  return final;
};
exports.page = async (user, page, limit) => {
  await exports.expireBatch({
    $or: [{ "orders.buyer": user }, { "orders.seller": user }],
  });
  const [result] = await Offer.aggregate([
    { $unwind: "$orders" },
    { $match: { $or: [{ "orders.buyer": user }, { "orders.seller": user }] } },
    { $replaceWith: "$orders" },
    { $sort: { createdAt: -1, _id: -1 } },
    {
      $facet: {
        orders: [{ $skip: (page - 1) * limit }, { $limit: limit }],
        count: [{ $count: "count" }],
      },
    },
  ]);
  return {
    orders: result.orders,
    count: result.count[0]?.count || 0,
    page,
    limit,
  };
};
