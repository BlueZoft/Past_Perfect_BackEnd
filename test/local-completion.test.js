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
const { listQuery } = require("../lib/listings");
test("typed search bounds operators and numeric ranges while preserving literal text", () => {
  for (const [category, value] of [
    [undefined, {}],
    ["furniture", { widthCm: { $gt: 5 } }],
    ["furniture", { widthCm: { min: 50, max: 20 } }],
    ["furniture", { widthCm: { min: 0 } }],
    ["furniture", { widthCm: {} }],
    ["books", { brand: "X" }],
    ["books", { author: { $ne: "" } }],
  ])
    assert.throws(() =>
      listQuery({ category, attributeFilters: JSON.stringify(value) }),
    );
  const query = listQuery({
    category: "electronics",
    attributeFilters: JSON.stringify({ brand: ".*[x]" }),
  });
  assert.equal(query.filter["attributes.brand"].test("any brand"), false);
  assert.equal(query.filter["attributes.brand"].test("the .*[x] brand"), true);
});
test("health endpoints expose no configuration and readiness fails without MongoDB", async () => {
  const app = require("../app");
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const base = "http://127.0.0.1:" + server.address().port;
    const ready = await fetch(base + "/health/ready");
    assert.equal(ready.status, 503);
    assert.deepEqual(await ready.json(), { status: "not_ready" });
    assert.deepEqual(await (await fetch(base + "/health/live")).json(), {
      status: "ok",
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
test("local alerts, reviews, moderation and seller analytics", async (t) => {
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
    Notification = require("../models/Notification"),
    searches = require("../services/savedSearches"),
    alerts = require("../services/searchAlerts");
  await Offer.init();
  await Notification.init();
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
    return {
      user: await r.json(),
      cookie: r.headers.get("set-cookie").split(";")[0],
    };
  };
  let seller, buyer, admin, other, reviewed;
  const seed = (extra = {}) =>
    Offer.create({
      owner: seller.user._id,
      title: "A used desk",
      description: "A useful household item",
      price: 1200,
      condition: "Used",
      ...extra,
    });
  const order = async (status = "completed", owner = seller) => {
    const id = new mongoose.Types.ObjectId();
    await seed({
      owner: owner.user._id,
      status: "sold",
      orders: [
        {
          _id: id,
          listingId: new mongoose.Types.ObjectId(),
          buyer: buyer.user._id,
          seller: owner.user._id,
          title: "Test desk",
          itemMinor: 120000,
          platformFeeMinor: 0,
          deliveryMinor: 0,
          totalMinor: 120000,
          currency: "LKR",
          status,
          paymentMode: "test",
          revision: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
    return String(id);
  };
  try {
    assert.deepEqual(await (await request("GET", "/health/ready")).json(), {
      status: "ready",
    });
    assert.deepEqual(await (await request("GET", "/health/live")).json(), {
      status: "ok",
    });
    seller = await actor("seller");
    buyer = await actor("buyer");
    admin = await actor("admin");
    other = await actor("other");
    process.env.ADMIN_USER_IDS = admin.user._id;
    await t.test(
      "attribute matching is typed and saved canonically",
      async () => {
        await seed({
          category: "furniture",
          attributes: { widthCm: 75, heightCm: 90 },
        });
        await seed({
          category: "furniture",
          attributes: { widthCm: 150, heightCm: 90 },
        });
        const query = {
          category: "furniture",
          attributeFilters: JSON.stringify({
            heightCm: { max: 100 },
            widthCm: { min: 50, max: 100 },
          }),
        };
        const r = await request("GET", "/offers?" + new URLSearchParams(query));
        assert.equal(r.status, 200);
        assert.equal((await r.json()).count, 1);
        const stored = await searches.create(buyer.user._id, {
          name: "Desk",
          query,
        });
        assert.deepEqual(JSON.parse(stored.query.attributeFilters), {
          heightCm: { max: 100 },
          widthCm: { min: 50, max: 100 },
        });
        assert.equal(
          (await request("GET", "/offers?attributeFilters={}")).status,
          400,
        );
      },
    );
    await t.test(
      "alerts are opt-in, private and cursor-based with bounded paging and no self/hidden/suspended inventory",
      async () => {
        let record = await searches.create(buyer.user._id, {
          name: "New desk",
          query: { title: "Alert desk" },
          alertsEnabled: true,
        });
        const since = new Date(Date.now() - 60000);
        await User.updateOne(
          { _id: buyer.user._id, "savedSearches._id": record._id },
          {
            $set: {
              "savedSearches.$.alertsSince": since,
              "savedSearches.$.alertCursor.at": since,
            },
          },
        );
        for (let n = 0; n < 3; n++) await seed({ title: "Alert desk " + n });
        await seed({ title: "Alert desk hidden", moderationHidden: true });
        await seed({ title: "Alert desk own", owner: buyer.user._id });
        await User.updateOne(
          { _id: other.user._id },
          { $set: { suspended: true } },
        );
        await seed({ title: "Alert desk suspended", owner: other.user._id });
        const run = async () => {
          const account = await User.findById(buyer.user._id).select(
            "+savedSearches",
          );
          return alerts.search(
            account._id,
            account.savedSearches.id(record._id),
            new Date(Date.now() + 5000),
            2,
          );
        };
        assert.equal(await run(), 2);
        assert.equal(await run(), 1);
        assert.equal(await run(), 0);
        await seed({
          title: "Alert desk historical",
          createdAt: new Date(+since - 1000),
        });
        await seed({
          title: "Alert desk late insert",
          createdAt: new Date(+since + 1000),
        });
        let late = 0;
        for (let n = 0; n < 4; n++) late += await run();
        assert.equal(late, 1);

        assert.equal(
          await Notification.countDocuments({
            user: buyer.user._id,
            type: "search",
          }),
          4,
        );
        assert.equal(
          await Notification.countDocuments({
            user: seller.user._id,
            type: "search",
          }),
          0,
        );
        const mine = await searches.page(buyer.user._id);
        record = mine.searches.find(
          (item) => String(item._id) === String(record._id),
        );
        assert.equal(record.alertCursor, undefined);
        assert.equal(record.alertsEnabled, true);
        const disabled = await searches.change(
          buyer.user._id,
          String(record._id),
          { version: record.revision, alertsEnabled: false },
        );
        assert.equal(disabled.alertsEnabled, false);
        const r = await request(
          "PATCH",
          "/user/saved-searches/" + record._id,
          { version: disabled.revision, alertsEnabled: "true" },
          buyer,
        );
        assert.equal(r.status, 400);
        await User.updateOne(
          { _id: other.user._id },
          { $set: { suspended: false } },
        );
      },
    );
    await t.test(
      "notification persistence failure leaves scan progress retryable and duplicates are harmless",
      async () => {
        const stored = await searches.create(buyer.user._id, {
          name: "Retry",
          query: { title: "Retry desk" },
          alertsEnabled: true,
        });
        await User.updateOne(
          { _id: buyer.user._id, "savedSearches._id": stored._id },
          {
            $set: {
              "savedSearches.$.alertsSince": new Date(0),
              "savedSearches.$.alertCursor.at": new Date(0),
            },
          },
        );
        await seed({ title: "Retry desk" });
        let account = await User.findById(buyer.user._id).select(
            "+savedSearches",
          ),
          saved = account.savedSearches.id(stored._id);
        const original = Notification.updateOne;
        Notification.updateOne = async () => {
          throw new Error("Disposable outage");
        };
        try {
          await assert.rejects(
            alerts.search(account._id, saved, new Date(Date.now() + 5000)),
          );
        } finally {
          Notification.updateOne = original;
        }
        const after = await User.findById(buyer.user._id).select(
          "+savedSearches",
        );
        assert.equal(+after.savedSearches.id(stored._id).alertCursor.at, 0);
        assert.equal(
          await alerts.search(account._id, saved, new Date(Date.now() + 5000)),
          1,
        );
        assert.equal(
          await alerts.search(account._id, saved, new Date(Date.now() + 5000)),
          0,
        );
        assert.equal(
          await Notification.countDocuments({
            event: { $regex: "^search:" + stored._id + ":" },
          }),
          1,
        );
        assert.equal((await alerts.run()).userBatchLimit, 10);
      },
    );
    await t.test(
      "only the buyer of a completed unreviewed order can submit a bounded immutable review",
      async () => {
        reviewed = await order();
        const submit = (id, person, body = {}) =>
          request(
            "POST",
            "/orders/" + id + "/review",
            { rating: 4, text: "Useful item", version: 0, ...body },
            person,
          );
        assert.equal((await submit(reviewed, seller)).status, 403);
        assert.equal((await submit(reviewed, other)).status, 404);
        assert.equal(
          (await submit(reviewed, buyer, { rating: 6 })).status,
          400,
        );
        assert.equal(
          (await submit(reviewed, buyer, { text: " " })).status,
          400,
        );
        assert.equal(
          (await submit(reviewed, buyer, { hidden: false })).status,
          400,
        );
        assert.equal(
          (await submit(await order("confirmed"), buyer)).status,
          409,
        );
        const result = await Promise.all([
          submit(reviewed, buyer),
          submit(reviewed, buyer),
        ]);
        assert.deepEqual(result.map((r) => r.status).sort(), [201, 409]);
        const page = await (
          await request("GET", "/seller/" + seller.user._id + "/reviews")
        ).json();
        assert.equal(page.count, 1);
        assert.equal(page.reviews[0].test, true);
        assert.equal(page.summary.live.count, 0);
        assert.equal(page.summary.test.average, 4);
        assert.equal(page.reviews[0].orderId, undefined);
        assert.equal(page.reviews[0].moderation, undefined);
      },
    );
    await t.test(
      "review visibility/moderation respects revisions, conflict of interest and current order eligibility",
      async () => {
        const path = "/admin/reviews/" + reviewed;
        assert.equal(
          (await request("GET", "/admin/reviews", undefined, buyer)).status,
          403,
        );
        assert.equal(
          (
            await request(
              "PATCH",
              path,
              { version: 1, hidden: true, reason: "Review content" },
              admin,
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await request(
              "PATCH",
              path,
              { version: 1, hidden: false, reason: "Stale" },
              admin,
            )
          ).status,
          409,
        );
        assert.equal(
          (
            await (
              await request("GET", "/seller/" + seller.user._id + "/reviews")
            ).json()
          ).count,
          0,
        );
        assert.equal(
          (
            await request(
              "PATCH",
              path,
              { version: 2, hidden: false, reason: "Restored after review" },
              admin,
            )
          ).status,
          200,
        );
        process.env.ADMIN_USER_IDS += "," + buyer.user._id;
        assert.equal(
          (
            await request(
              "PATCH",
              path,
              { version: 3, hidden: true, reason: "Own review" },
              buyer,
            )
          ).status,
          403,
        );
        await User.updateOne(
          { _id: buyer.user._id },
          { $set: { suspended: true } },
        );
        assert.equal(
          (
            await (
              await request("GET", "/seller/" + seller.user._id + "/reviews")
            ).json()
          ).count,
          0,
        );
        await User.updateOne(
          { _id: buyer.user._id },
          { $set: { suspended: false } },
        );
        const listing = await Offer.findOne({ "orders._id": reviewed });
        await Offer.updateOne(
          { _id: listing._id, "orders._id": reviewed },
          { $set: { "orders.$.status": "refunded" } },
        );
        assert.equal(
          (
            await (
              await request("GET", "/seller/" + seller.user._id + "/reviews")
            ).json()
          ).count,
          0,
        );
        await Offer.updateOne(
          { _id: listing._id, "orders._id": reviewed },
          { $set: { "orders.$.status": "completed" } },
        );
      },
    );
    await t.test(
      "seller analytics is owner-scoped and labels only simulated checkout money",
      async () => {
        await order("completed", other);
        const r = await request(
          "GET",
          "/user/analytics?owner=" + other.user._id,
          undefined,
          seller,
        );
        assert.equal(r.status, 200);
        assert.equal(r.headers.get("cache-control"), "no-store");
        const data = await r.json();
        assert.equal(data.orders.completed, 1);
        assert.equal(data.orders.confirmed, 1);
        assert.equal(data.simulated.paidMinor, 240000);
        assert.equal(data.simulated.refundedMinor, 0);
        assert.equal(data.revenue, undefined);
        assert.equal((await request("GET", "/user/analytics")).status, 401);
      },
    );
  } finally {
    delete process.env.ADMIN_USER_IDS;
    await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
