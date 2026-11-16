const { test } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const path = require("path");
process.env.IMAGE_DRIVER = "local";
process.env.MAIL_DRIVER = "disabled";
process.env.CATALOGUE_FILE = path.join(__dirname, "../config/catalogue.json");
process.env.POLICY_FILE = path.join(__dirname, "../config/policy.json");
process.env.WEB_ORIGIN = "http://localhost:3000";
test("atomic orders, server totals, idempotent holds, expiry and test-only payment lifecycle", async (t) => {
  await mongoose.connect(
    process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27017",
    {
      dbName:
        "pastperfect_test_" + require("crypto").randomBytes(8).toString("hex"),
    },
  );
  const app = require("../app"),
    Offer = require("../models/Offer"),
    User = require("../models/User");
  await Offer.init();
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  const request = (method, url, body, cookie) =>
    fetch(base + url, {
      method,
      headers: {
        Origin: process.env.WEB_ORIGIN,
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const actor = async (name, verified = true) => {
    const r = await request("POST", "/user/signup", {
      email: name + "@example.invalid",
      username: name,
      password: "test-secure-password",
    });
    assert.equal(r.status, 201);
    const result = {
      user: await r.json(),
      cookie: r.headers.get("set-cookie").split(";")[0],
    };
    if (verified)
      await User.updateOne(
        { _id: result.user._id },
        { $set: { emailVerifiedAt: new Date() } },
      );
    return result;
  };
  let seller, buyer, other, listing, order;
  const make = async () =>
    Offer.create({
      owner: seller.user._id,
      title: "A used book",
      description: "A useful second hand book",
      price: 1200,
      condition: "Used",
    });
  const payload = async (
    item,
    person,
    key = "test-request-" + require("crypto").randomBytes(8).toString("hex"),
  ) => {
    const quote = await (
      await request(
        "GET",
        "/offer/" + item._id + "/quote",
        undefined,
        person.cookie,
      )
    ).json();
    return {
      listingId: String(item._id),
      listingVersion: quote.listingVersion,
      expectedTotalMinor: quote.totalMinor,
      idempotencyKey: key,
    };
  };
  try {
    seller = await actor("seller");
    buyer = await actor("buyer");
    other = await actor("other");
    listing = await make();
    await t.test(
      "disabled payment mode refuses order creation without locking inventory",
      async () => {
        delete process.env.PAYMENT_DRIVER;
        const body = await payload(listing, buyer);
        assert.equal(body.expectedTotalMinor, 120000);
        assert.equal(
          (await request("POST", "/orders", body, buyer.cookie)).status,
          503,
        );
        assert.equal((await Offer.findById(listing._id)).orderLock, false);
        process.env.PAYMENT_DRIVER = "test";
      },
    );
    await t.test(
      "server prices, verification and seller ownership are enforced",
      async () => {
        const unverified = await actor("unverified", false);
        assert.equal(
          (
            await request(
              "POST",
              "/orders",
              await payload(listing, unverified),
              unverified.cookie,
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await request(
              "GET",
              "/offer/" + listing._id + "/quote",
              undefined,
              seller.cookie,
            )
          ).status,
          400,
        );
        const body = await payload(listing, buyer);
        assert.equal(
          (
            await request(
              "POST",
              "/orders",
              { ...body, expectedTotalMinor: 1 },
              buyer.cookie,
            )
          ).status,
          409,
        );
        assert.equal(
          (
            await request(
              "POST",
              "/orders",
              { ...body, amount: 1 },
              buyer.cookie,
            )
          ).status,
          400,
        );
      },
    );
    await t.test("competing buyers produce only one active order", async () => {
      const a = await payload(listing, buyer),
        b = await payload(listing, other);
      const results = await Promise.all([
        request("POST", "/orders", a, buyer.cookie),
        request("POST", "/orders", b, other.cookie),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
      const index = results[0].status === 201 ? 0 : 1;
      order = await results[index].json();
      const winner = index === 0 ? buyer : other;
      const replay = await request(
        "POST",
        "/orders",
        index === 0 ? a : b,
        winner.cookie,
      );
      assert.equal(replay.status, 200);
      assert.equal((await replay.json())._id, order._id);
      assert.equal(
        (await Offer.findById(listing._id).select("+orders")).orders.length,
        1,
      );
    });
    await t.test(
      "active holds prevent seller changes and do not leak private order data",
      async () => {
        const current = await Offer.findById(listing._id);
        assert.equal(current.status, "reserved");
        assert.equal(
          (
            await request(
              "DELETE",
              "/offer/" + listing._id,
              { version: current.__v },
              seller.cookie,
            )
          ).status,
          409,
        );
        assert.equal(
          (
            await request(
              "PATCH",
              "/offer/" + listing._id + "/status",
              { status: "active", version: current.__v },
              seller.cookie,
            )
          ).status,
          409,
        );
        const detail = await (
          await request("GET", "/offer/" + listing._id)
        ).json();
        assert.equal(detail.orders, undefined);
        assert.equal(detail.reservation, undefined);
        const stranger = await actor("stranger");
        assert.equal(
          (
            await request(
              "GET",
              "/orders/" + order._id,
              undefined,
              stranger.cookie,
            )
          ).status,
          404,
        );
        assert.equal(
          (
            await request(
              "POST",
              "/orders/" + order._id + "/cancel",
              { version: 0 },
              stranger.cookie,
            )
          ).status,
          404,
        );
      },
    );
    await t.test(
      "cancellation releases inventory and stale actions are rejected",
      async () => {
        assert.equal(
          (
            await request(
              "POST",
              "/orders/" + order._id + "/cancel",
              { version: 0 },
              seller.cookie,
            )
          ).status,
          200,
        );
        assert.equal((await Offer.findById(listing._id)).status, "active");
        assert.equal(
          (
            await request(
              "POST",
              "/orders/" + order._id + "/cancel",
              { version: 0 },
              seller.cookie,
            )
          ).status,
          409,
        );
      },
    );
    await t.test(
      "expired reservations cannot be paid and do not release a newer buyers hold",
      async () => {
        const expiring = await actor("expiring");
        let r = await request(
          "POST",
          "/orders",
          await payload(listing, expiring),
          expiring.cookie,
        );
        assert.equal(r.status, 201);
        const expired = await r.json();
        await Offer.updateOne(
          { _id: listing._id },
          { $set: { "reservation.expiresAt": new Date(0) } },
        );
        assert.equal(
          (
            await request(
              "POST",
              "/orders/" + expired._id + "/test-success",
              { version: 0 },
              expiring.cookie,
            )
          ).status,
          409,
        );
        assert.equal(
          (
            await (
              await request(
                "GET",
                "/orders/" + expired._id,
                undefined,
                expiring.cookie,
              )
            ).json()
          ).status,
          "expired",
        );
        const next = await actor("next");
        r = await request(
          "POST",
          "/orders",
          await payload(listing, next),
          next.cookie,
        );
        assert.equal(r.status, 201);
        const fresh = await r.json();
        assert.equal(
          (
            await request(
              "POST",
              "/orders/" + expired._id + "/cancel",
              { version: 1 },
              expiring.cookie,
            )
          ).status,
          409,
        );
        assert.equal(
          (
            await Offer.findById(listing._id).select("+reservation")
          ).reservation.orderId.toString(),
          fresh._id,
        );
        await request(
          "POST",
          "/orders/" + fresh._id + "/cancel",
          { version: 0 },
          next.cookie,
        );
      },
    );
    await t.test(
      "idempotency keys cannot be reused for a different listing",
      async () => {
        const person = await actor("idempotent"),
          first = await make(),
          second = await make();
        const key = "idempotent-key-reused";
        assert.equal(
          (
            await request(
              "POST",
              "/orders",
              await payload(first, person, key),
              person.cookie,
            )
          ).status,
          201,
        );
        assert.equal(
          (
            await request(
              "POST",
              "/orders",
              await payload(second, person, key),
              person.cookie,
            )
          ).status,
          409,
        );
        assert.equal((await Offer.findById(second._id)).status, "active");
      },
    );
    await t.test(
      "test payment, collection readiness and completion are role/version checked",
      async () => {
        const person = await actor("paying"),
          item = await make();
        let r = await request(
          "POST",
          "/orders",
          await payload(item, person),
          person.cookie,
        );
        assert.equal(r.status, 201);
        let current = await r.json();
        assert.equal(
          (
            await request(
              "POST",
              "/orders/" + current._id + "/test-success",
              { version: 0, amount: 1 },
              person.cookie,
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await request(
              "POST",
              "/orders/" + current._id + "/test-success",
              { version: 0 },
              seller.cookie,
            )
          ).status,
          403,
        );
        process.env.NODE_ENV = "production";
        assert.equal(
          (
            await request(
              "POST",
              "/orders/" + current._id + "/test-success",
              { version: 0 },
              person.cookie,
            )
          ).status,
          503,
        );
        delete process.env.NODE_ENV;
        r = await request(
          "POST",
          "/orders/" + current._id + "/test-success",
          { version: 0 },
          person.cookie,
        );
        assert.equal(r.status, 200);
        current = await r.json();
        assert.equal(current.status, "confirmed");
        assert.equal(current.paymentMode, "test");
        assert.equal(
          (await Offer.findById(item._id).select("+reservation")).reservation
            .expiresAt,
          undefined,
        );
        assert.equal(current.totalMinor, 120000);
        assert.equal((await Offer.findById(item._id)).status, "sold");
        assert.equal(
          (
            await request(
              "POST",
              "/orders/" + current._id + "/ready",
              { version: current.revision },
              person.cookie,
            )
          ).status,
          409,
        );
        r = await request(
          "POST",
          "/orders/" + current._id + "/ready",
          { version: current.revision },
          seller.cookie,
        );
        assert.equal(r.status, 200);
        current = await r.json();
        assert.equal(current.status, "ready");
        r = await request(
          "POST",
          "/orders/" + current._id + "/complete",
          { version: current.revision },
          person.cookie,
        );
        assert.equal(r.status, 200);
        current = await r.json();
        assert.equal(current.status, "completed");
        assert.equal((await Offer.findById(item._id)).orderLock, false);
        const list = await (
          await request("GET", "/user/orders", undefined, person.cookie)
        ).json();
        assert.equal(list.count, 1);
        assert.equal(list.orders[0].status, "completed");
        let contact = await request(
          "POST",
          "/orders/" + current._id + "/enquiry",
          { message: "Collection arranged" },
          person.cookie,
        );
        assert.equal(contact.status, 201);
        const enquiry = (await contact.json())._id;
        assert.equal(
          (
            await request(
              "GET",
              "/enquiry/" + enquiry + "/messages",
              undefined,
              seller.cookie,
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await request(
              "POST",
              "/orders/" + current._id + "/enquiry",
              { message: "Intrusion" },
              other.cookie,
            )
          ).status,
          404,
        );
      },
    );
    await t.test(
      "simulated failed payment releases the item without confirming an order",
      async () => {
        const person = await actor("failure"),
          item = await make();
        let r = await request(
          "POST",
          "/orders",
          await payload(item, person),
          person.cookie,
        );
        const current = await r.json();
        r = await request(
          "POST",
          "/orders/" + current._id + "/test-failure",
          { version: 0 },
          person.cookie,
        );
        assert.equal(r.status, 200);
        assert.equal((await r.json()).status, "payment_failed");
        assert.equal((await Offer.findById(item._id)).status, "active");
      },
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
