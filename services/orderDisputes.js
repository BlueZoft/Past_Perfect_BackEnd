const Offer = require("../models/Offer");
const orders = require("./orders");
const config = require("./orderConfig");
const { fail } = require("../lib/http");
const { validateId } = require("./listings");

function text(value) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 2000)
    throw fail(400, "Dispute text must be 1–2000 characters");
  return value.trim();
}
exports.read = async (id) => {
  validateId(id);
  const listing = await Offer.findOne({ "orders._id": id }).select(
    "+orders +reservation",
  );
  const order = listing?.orders.find(
    (item) => String(item._id) === id.toLowerCase(),
  );
  if (!order?.dispute) throw fail(404, "Order dispute not found");
  return { listing, order };
};
exports.change = async (id, user, action, input, admin = false) => {
  const { version } = input;
  if (!Number.isSafeInteger(version) || version < 0)
    throw fail(400, "A valid order version is required");
  const { listing, order } = admin
    ? await exports.read(id)
    : await orders.read(id, user._id);
  if (
    admin &&
    [order.buyer, order.seller].some(
      (actor) => String(actor) === String(user._id),
    )
  )
    throw fail(403, "Administrators cannot resolve their own order disputes");
  if (order.revision !== version)
    throw fail(409, "Order changed. Reload before trying again.");
  const now = new Date();
  const set = { "orders.$.updatedAt": now };
  let refund = false;
  if (action === "open") {
    config.requireTest();
    if (String(order.buyer) !== String(user._id))
      throw fail(403, "Only the buyer can open an order dispute");
    if (
      order.paymentMode !== "test" ||
      !["confirmed", "ready", "completed"].includes(order.status) ||
      order.dispute
    )
      throw fail(409, "This order cannot open a dispute");
    set["orders.$.status"] = "disputed";
    set["orders.$.dispute"] = {
      status: "open",
      previousStatus: order.status,
      reason: text(input.reason),
      openedBy: user._id,
      openedAt: now,
    };
  } else {
    if (order.status !== "disputed" || order.dispute?.status !== "open")
      throw fail(409, "Order dispute is already closed or unavailable");
    if (action === "respond") {
      if (String(order.seller) !== String(user._id))
        throw fail(403, "Only the seller can respond to an order dispute");
      if (order.dispute.respondedAt)
        throw fail(409, "Seller response already recorded");
      set["orders.$.dispute.response"] = text(input.response);
      set["orders.$.dispute.respondedAt"] = now;
    } else if (["refund", "decline"].includes(action)) {
      if (
        !admin &&
        (action !== "refund" || String(order.seller) !== String(user._id))
      )
        throw fail(
          403,
          "Only the seller or an administrator can resolve this dispute",
        );
      refund = action === "refund";
      if (refund) {
        config.requireTest();
        if (order.paymentMode !== "test")
          throw fail(409, "Only test payments can be refunded");
        set["orders.$.dispute.refundMinor"] = order.totalMinor;
        set["orders.$.dispute.refundReference"] = "test-refund-" + order._id;
      }
      set["orders.$.status"] = refund
        ? "refunded"
        : order.dispute.previousStatus;
      set["orders.$.dispute.status"] = refund ? "refunded" : "declined";
      set["orders.$.dispute.resolution"] = text(input.resolution);
      set["orders.$.dispute.resolvedBy"] = user._id;
      set["orders.$.dispute.resolvedAt"] = now;
    } else throw fail(400, "Invalid dispute action");
  }
  const query = {
    _id: listing._id,
    orders: {
      $elemMatch: { _id: order._id, revision: version, status: order.status },
    },
  };
  // Uncollected orders retain their existing inventory lock throughout review.
  // Completed orders can already have a removed listing; never rewrite that state.
  const prior = action === "open" ? order.status : order.dispute.previousStatus;
  const locked = prior !== "completed";
  if (locked) {
    query.orderLock = true;
    query["reservation.orderId"] = order._id;
  }
  if (refund && locked) set.orderLock = false;
  const result = await Offer.findOneAndUpdate(
    query,
    {
      $set: set,
      $inc: { __v: 1, "orders.$.revision": 1 },
      ...(refund && locked ? { $unset: { reservation: "" } } : {}),
    },
    { new: true, runValidators: true },
  ).select("+orders");
  if (!result) throw fail(409, "Order changed. Reload before trying again.");
  const final = result.orders.find(
    (item) => String(item._id) === String(order._id),
  );
  await orders.notices(final, "dispute:" + final.revision);
  return final;
};
exports.page = async (status, page, limit) => {
  if (!["open", "refunded", "declined"].includes(status))
    throw fail(400, "Invalid dispute status");
  const [result] = await Offer.aggregate([
    { $match: { "orders.dispute.status": status } },
    { $unwind: "$orders" },
    { $match: { "orders.dispute.status": status } },
    { $replaceWith: "$orders" },
    { $sort: { "dispute.openedAt": -1, _id: -1 } },
    { $unset: "requestKey" },
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
