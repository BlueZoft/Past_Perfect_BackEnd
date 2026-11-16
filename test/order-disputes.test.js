const { test } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const path = require("path");
process.env.IMAGE_DRIVER = "local";
process.env.MAIL_DRIVER = "disabled";
process.env.PAYMENT_DRIVER = "test";
process.env.CATALOGUE_FILE = path.join(__dirname, "../config/catalogue.json");
process.env.POLICY_FILE = path.join(__dirname, "../config/policy.json");
process.env.WEB_ORIGIN = "http://localhost:3000";
test("private versioned disputes and simulated full refunds", async (t) => {
  await mongoose.connect(
    process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27017",
    {
      dbName:
        "pastperfect_test_" + require("crypto").randomBytes(8).toString("hex"),
    },
  );
  const app = require("../app"),
    Offer = require("../models/Offer"),
    User = require("../models/User"),
    Notification = require("../models/Notification");
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  const request = (method, url, body, person) =>
    fetch(base + url, {
      method,
      headers: {
        Origin: process.env.WEB_ORIGIN,
        ...(person ? { Cookie: person.cookie } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const actor = async (name) => {
    const r = await request("POST", "/user/signup", {
      email: name + "@example.invalid",
      username: name,
      password: "test-secure-password",
    });
    assert.equal(r.status, 201);
    const user = await r.json();
    await User.updateOne(
      { _id: user._id },
      { $set: { emailVerifiedAt: new Date() } },
    );
    return { user, cookie: r.headers.get("set-cookie").split(";")[0] };
  };
  const change = async (order, action, person, extra = {}, expected = 200) => {
    const r = await request(
      "POST",
      "/orders/" + order._id + "/" + action,
      { version: order.revision, ...extra },
      person,
    );
    const result = await r.json();
    assert.equal(r.status, expected, JSON.stringify(result));
    return result;
  };
  const resolve = (order, decision, person, version = order.revision) =>
    request(
      "POST",
      "/admin/order-disputes/" + order._id + "/resolve",
      { version, decision, resolution: "Shared review outcome" },
      person,
    );
  let seller, buyer, admin, stranger;
  const make = async (stage = "confirmed") => {
    const item = await Offer.create({
      owner: seller.user._id,
      title: "Used book",
      description: "A useful second hand book",
      price: 1200,
      condition: "Used",
    });
    const quote = await (
      await request("GET", "/offer/" + item._id + "/quote", undefined, buyer)
    ).json();
    const r = await request(
      "POST",
      "/orders",
      {
        listingId: String(item._id),
        listingVersion: quote.listingVersion,
        expectedTotalMinor: quote.totalMinor,
        idempotencyKey: require("crypto").randomBytes(16).toString("hex"),
      },
      buyer,
    );
    assert.equal(r.status, 201);
    let order = await r.json();
    if (stage !== "awaiting_payment")
      order = await change(order, "test-success", buyer);
    if (["ready", "completed"].includes(stage))
      order = await change(order, "ready", seller);
    if (stage === "completed") order = await change(order, "complete", buyer);
    return { item, order };
  };
  try {
    seller = await actor("seller");
    buyer = await actor("buyer");
    admin = await actor("admin");
    stranger = await actor("stranger");
    process.env.ADMIN_USER_IDS = admin.user._id;
    await t.test(
      "buyers open one private case; seller refunds cannot forge money or run in production",
      async () => {
        let { item, order } = await make();
        await change(order, "dispute", seller, { reason: "Wrong role" }, 403);
        await change(
          order,
          "dispute",
          stranger,
          { reason: "Wrong participant" },
          404,
        );
        await change(order, "dispute", buyer, { reason: " " }, 400);
        await change(
          order,
          "dispute",
          buyer,
          { reason: "x".repeat(2001) },
          400,
        );
        order = await change(order, "dispute", buyer, {
          reason: "Item does not match the description",
        });
        assert.equal(order.status, "disputed");
        assert.equal(order.dispute.previousStatus, "confirmed");
        await change(order, "ready", seller, {}, 409);
        assert.equal(
          (await request("GET", "/admin/order-disputes", undefined, stranger))
            .status,
          403,
        );
        const queue = await (
          await request("GET", "/admin/order-disputes", undefined, admin)
        ).json();
        assert.equal(queue.count, 1);
        assert.equal(queue.orders[0].requestKey, undefined);
        assert.equal(
          (
            await request(
              "GET",
              "/admin/order-disputes/" + order._id,
              undefined,
              admin,
            )
          ).headers.get("cache-control"),
          "no-store",
        );
        assert.equal(
          (await (await request("GET", "/offer/" + item._id)).json()).orders,
          undefined,
        );
        await change(
          order,
          "test-refund",
          buyer,
          { resolution: "Self approval" },
          403,
        );
        await change(
          order,
          "test-refund",
          seller,
          { resolution: "Approved", refundMinor: 1 },
          400,
        );
        process.env.NODE_ENV = "production";
        await change(
          order,
          "test-refund",
          seller,
          { resolution: "Approved" },
          503,
        );
        delete process.env.NODE_ENV;
        assert.equal((await Offer.findById(item._id)).orderLock, true);
        const revision = order.revision;
        order = await change(order, "test-refund", seller, {
          resolution: "Agreed to a full simulated refund",
        });
        assert.equal(order.status, "refunded");
        assert.equal(order.totalMinor, 120000);
        assert.equal(order.dispute.refundMinor, 120000);
        assert.equal(order.dispute.refundReference, "test-refund-" + order._id);
        assert.equal(order.dispute.resolvedBy, seller.user._id);
        const listing = await Offer.findById(item._id).select("+reservation");
        assert.equal(listing.orderLock, false);
        assert.equal(listing.status, "sold");
        assert.equal(listing.reservation, undefined);
        await change(
          order,
          "test-refund",
          seller,
          { resolution: "Again" },
          409,
        );
        assert.equal(
          (await resolve(order, "refund", admin, revision)).status,
          409,
        );
        assert.equal(
          await Notification.countDocuments({
            event: "order:" + order._id + ":dispute:" + order.revision,
          }),
          2,
        );
      },
    );
    await t.test(
      "seller response is immutable and admin rejection restores the prior collection stage",
      async () => {
        let { item, order } = await make("ready");
        // Suspended participants retain access to dispute protection, but not fulfilment.
        await User.updateOne(
          { _id: buyer.user._id },
          { $set: { suspended: true } },
        );
        order = await change(order, "dispute", buyer, {
          reason: "Collection issue",
        });
        order = await change(order, "dispute-response", seller, {
          response: "Item remains available for collection",
        });
        await change(
          order,
          "dispute-response",
          seller,
          { response: "Replacement" },
          409,
        );
        await change(order, "complete", buyer, {}, 403);
        process.env.ADMIN_USER_IDS += "," + seller.user._id;
        assert.equal((await resolve(order, "decline", seller)).status, 403);
        assert.equal((await resolve(order, "decline", buyer)).status, 403);
        const r = await resolve(order, "decline", admin);
        assert.equal(r.status, 200);
        order = await r.json();
        assert.equal(order.status, "ready");
        assert.equal(order.dispute.status, "declined");
        assert.equal(
          order.dispute.response,
          "Item remains available for collection",
        );
        assert.equal(order.dispute.resolvedBy, admin.user._id);
        assert.equal((await Offer.findById(item._id)).orderLock, true);
        await User.updateOne(
          { _id: buyer.user._id },
          { $set: { suspended: false } },
        );
        order = await change(order, "complete", buyer);
        await change(order, "dispute", buyer, { reason: "Reopen" }, 409);
        assert.equal((await Offer.findById(item._id)).orderLock, false);
      },
    );
    await t.test(
      "refund after collection preserves removed listing and snapshots",
      async () => {
        let { item, order } = await make("completed");
        await Offer.updateOne(
          { _id: item._id },
          { $set: { status: "removed", removedAt: new Date() } },
        );
        order = await change(order, "dispute", buyer, {
          reason: "Problem discovered after collection",
        });
        const r = await resolve(order, "refund", admin);
        assert.equal(r.status, 200);
        order = await r.json();
        assert.equal(order.dispute.previousStatus, "completed");
        assert.equal(order.dispute.refundMinor, order.totalMinor);
        assert.equal(order.requestKey, undefined);
        const listing = await Offer.findById(item._id);
        assert.equal(listing.status, "removed");
        assert.equal(listing.orderLock, false);
        const own = await (
          await request("GET", "/orders/" + order._id, undefined, buyer)
        ).json();
        assert.equal(own.dispute.status, "refunded");
      },
    );
    await t.test(
      "concurrent refund/rejection commits exactly one resolution",
      async () => {
        let { item, order } = await make();
        order = await change(order, "dispute", buyer, {
          reason: "Review this order",
        });
        const outcomes = await Promise.all([
          resolve(order, "refund", admin),
          resolve(order, "decline", admin),
        ]);
        assert.deepEqual(outcomes.map((r) => r.status).sort(), [200, 409]);
        const saved = await (
          await request("GET", "/orders/" + order._id, undefined, buyer)
        ).json();
        assert.equal(saved.revision, order.revision + 1);
        const listing = await Offer.findById(item._id);
        assert.equal(listing.status, "sold");
        assert.equal(listing.orderLock, saved.dispute.status !== "refunded");
      },
    );
    await t.test(
      "unpaid orders and invalid decisions cannot enter dispute flow",
      async () => {
        const { order } = await make("awaiting_payment");
        await change(order, "dispute", buyer, { reason: "Unpaid" }, 409);
        assert.equal(
          (
            await request(
              "GET",
              "/admin/order-disputes?status=invalid",
              undefined,
              admin,
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await request(
              "GET",
              "/admin/order-disputes/not-an-id",
              undefined,
              admin,
            )
          ).status,
          400,
        );
        assert.equal((await resolve(order, "invalid", admin)).status, 400);
        await change(order, "cancel", buyer);
      },
    );
  } finally {
    delete process.env.NODE_ENV;
    delete process.env.ADMIN_USER_IDS;
    await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
