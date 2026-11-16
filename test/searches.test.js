const { test } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const path = require("path");
process.env.IMAGE_DRIVER = "local";
process.env.MAIL_DRIVER = "disabled";
process.env.CATALOGUE_FILE = path.join(__dirname, "../config/catalogue.json");
process.env.POLICY_FILE = path.join(__dirname, "../config/policy.json");
process.env.WEB_ORIGIN = "http://localhost:3000";
const { listQuery } = require("../lib/listings");
test("keyword/filter validation rejects operators, invalid combinations and unsupported saved fields", () => {
  for (const query of [
    { q: { $ne: "" } },
    { q: "x".repeat(121) },
    { q: "㍿".repeat(120) },
    { q: "book", title: "book" },
    { sort: "relevance" },
    { condition: "bad" },
    { size: "XXX" },
    { category: "books", size: "M" },
  ])
    assert.throws(() => listQuery(query));
  assert.equal(listQuery({ q: " Ｂｏｏｋ " }).filter.$text.$search, "Book");
  assert.equal(listQuery({ q: "book" }).sort.searchScore.$meta, "textScore");
  assert.deepEqual(listQuery({ q: "book", sort: "newest" }).sort, {
    createdAt: -1,
    _id: -1,
  });
  const searches = require("../services/savedSearches");
  for (const query of [
    { page: "2" },
    { owner: "x" },
    { $where: "x" },
    { q: ["book"] },
    { priceMin: 100 },
  ])
    assert.throws(() => searches.query(query));
  assert.deepEqual(
    searches.query({ q: " book ", priceMin: "00100", condition: "" }),
    { q: "book", priceMin: "100", sort: "relevance" },
  );
});
test("indexed discovery and atomic private saved searches", async (t) => {
  await mongoose.connect(
    process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27017",
    {
      dbName:
        "pastperfect_test_" + require("crypto").randomBytes(8).toString("hex"),
    },
  );
  const Offer = require("../models/Offer"),
    User = require("../models/User"),
    app = require("../app");
  await Offer.init();
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
  let owner, other, suspended, buyer, stored;
  const seed = (extra) =>
    Offer.create({
      owner: owner.user._id,
      title: "Used lamp",
      description: "A useful household object",
      price: 500,
      condition: "Used",
      ...extra,
    });
  const get = async (query) => {
    const r = await request("GET", "/offers?" + new URLSearchParams(query));
    const data = await r.json();
    assert.equal(r.status, 200, JSON.stringify(data));
    return data;
  };
  const save = (query, person = buyer, name = "My search") =>
    request("POST", "/user/saved-searches", { name, query }, person);
  try {
    owner = await actor("owner");
    other = await actor("other");
    suspended = await actor("suspended");
    buyer = await actor("buyer");
    await User.updateOne(
      { _id: suspended.user._id },
      { $set: { suspended: true } },
    );
    const titleMatch = await seed({ title: "Sapphire Sapphire lamp" });
    const descriptionMatch = await seed({
      description: "Sapphire finish on this household object",
    });
    await seed({ title: "Sapphire hidden lamp", moderationHidden: true });
    await seed({ title: "Sapphire removed lamp", status: "removed" });
    await seed({ title: "Sapphire reserved lamp", status: "reserved" });
    await seed({ title: "Sapphire suspended lamp", owner: suspended.user._id });
    await seed({ title: "Literal .*[x] item" });
    await seed({
      title: "පරණ පොත",
      description: "A second hand book in Sinhala",
    });
    await seed({
      title: "தமிழ் புத்தகம்",
      description: "A second hand book in Tamil",
    });
    await seed({
      title: "Green cotton shirt",
      category: "clothing",
      size: "M",
      condition: "Like New",
      price: 900,
    });
    await seed({
      title: "Blue cotton shirt",
      category: "clothing",
      size: "L",
      condition: "Used",
      price: 700,
    });
    await t.test(
      "keyword index finds title/description, ranks title and excludes unsafe inventory before counting",
      async () => {
        const result = await get({ q: "Sapphire", limit: "1" });
        assert.equal(result.count, 2);
        assert.equal(result.offers[0]._id, String(titleMatch._id));
        assert.equal(result.offers[0].searchScore, undefined);
        assert.equal(result.offers[0].orders, undefined);
        assert.equal(result.offers[0].reservation, undefined);
        const next = await get({ q: "Sapphire", limit: "1", page: "2" });
        assert.equal(next.offers[0]._id, String(descriptionMatch._id));
        const plan = await Offer.find({
          $text: { $search: "Sapphire", $language: "none" },
        }).explain("queryPlanner");
        assert.match(JSON.stringify(plan), /listing_keywords/);
        assert.equal(
          (await get({ q: "Sapphire", sort: "price-asc" })).count,
          2,
        );
        assert.equal((await get({ q: '"Sapphire finish"' })).count, 1);
        assert.equal((await get({ q: "Sapphire -finish" })).count, 1);
        const seller = await (
          await request("GET", "/seller/" + owner.user._id + "?q=Sapphire")
        ).json();
        assert.equal(seller.count, 2);
        const own = await request(
          "GET",
          "/user/offers?q=Sapphire",
          undefined,
          owner,
        );
        assert.equal(own.status, 200);
      },
    );
    await t.test(
      "Unicode keywords, literal legacy title and combined condition/size/range filters work",
      async () => {
        assert.equal((await get({ q: "පොත" })).count, 1);
        assert.equal((await get({ q: "புத்தகம்" })).count, 1);
        assert.equal((await get({ title: ".*[x]" })).count, 1);
        const result = await get({
          q: "shirt",
          condition: "Like New",
          category: "clothing",
          size: "M",
          priceMin: "800",
          priceMax: "1000",
        });
        assert.equal(result.count, 1);
        assert.equal(result.offers[0].title, "Green cotton shirt");
        assert.equal(
          (await get({ q: "shirt", size: "M", priceMax: "800" })).count,
          0,
        );
        assert.equal((await request("GET", "/offers?q[]=book")).status, 400);
      },
    );
    await t.test(
      "saved filters are private, canonical, duplicate-safe and not exposed by session/public profile",
      async () => {
        assert.equal(
          (await request("GET", "/user/saved-searches")).status,
          401,
        );
        assert.equal((await save({ q: "Sapphire" }, suspended)).status, 403);
        assert.equal((await save({ q: "shirt", page: "2" })).status, 400);
        assert.equal(
          (await save({ priceMin: "20", priceMax: "10" })).status,
          400,
        );
        assert.equal((await save({}, buyer, " ")).status, 400);
        const r = await save({
          q: " Sapphire ",
          priceMin: "00001",
          sort: "relevance",
        });
        assert.equal(r.status, 201);
        stored = await r.json();
        assert.equal(stored.fingerprint, undefined);
        assert.deepEqual(stored.query, {
          q: "Sapphire",
          priceMin: "1",
          sort: "relevance",
        });
        assert.equal(
          (
            await save(
              { priceMin: "1", q: "Sapphire" },
              buyer,
              "Duplicate name",
            )
          ).status,
          409,
        );
        const mine = await request(
          "GET",
          "/user/saved-searches",
          undefined,
          buyer,
        );
        assert.equal(mine.headers.get("cache-control"), "no-store");
        assert.equal((await mine.json()).count, 1);
        assert.equal(
          (
            await (
              await request("GET", "/user/saved-searches", undefined, other)
            ).json()
          ).count,
          0,
        );
        assert.equal(
          (await (await request("GET", "/user/me", undefined, buyer)).json())
            .savedSearches,
          undefined,
        );
        const profile = await (
          await request("GET", "/seller/" + buyer.user._id)
        ).json();
        assert.equal(profile.seller.savedSearches, undefined);
        assert.equal(
          (await User.findById(buyer.user._id)).savedSearches,
          undefined,
        );
        // Re-running a saved query uses current public visibility, not frozen listing IDs.
        assert.equal((await get(stored.query)).count, 2);
        await Offer.updateOne(
          { _id: titleMatch._id },
          { $set: { moderationHidden: true } },
        );
        assert.equal((await get(stored.query)).count, 1);
      },
    );
    await t.test(
      "owner-scoped renames/removal reject stale revisions and foreign IDs",
      async () => {
        let r = await request(
          "PATCH",
          "/user/saved-searches/" + stored._id,
          { name: "New name", version: 0 },
          other,
        );
        assert.equal(r.status, 404);
        r = await request(
          "PATCH",
          "/user/saved-searches/" + stored._id,
          { name: "New name", version: 0, query: {} },
          buyer,
        );
        assert.equal(r.status, 400);
        r = await request(
          "PATCH",
          "/user/saved-searches/" + stored._id,
          { name: "New name", version: 0 },
          buyer,
        );
        assert.equal(r.status, 200);
        const updated = await r.json();
        assert.equal(updated.name, "New name");
        assert.equal(updated.revision, 1);
        assert.deepEqual(updated.query, stored.query);
        assert.equal(
          (
            await request(
              "DELETE",
              "/user/saved-searches/" + stored._id,
              { version: 0 },
              buyer,
            )
          ).status,
          409,
        );
        assert.equal(
          (
            await request(
              "DELETE",
              "/user/saved-searches/" + stored._id,
              { version: 1 },
              other,
            )
          ).status,
          404,
        );
        assert.equal(
          (
            await request(
              "DELETE",
              "/user/saved-searches/" + stored._id,
              { version: 1 },
              buyer,
            )
          ).status,
          204,
        );
        assert.equal(
          (
            await request(
              "DELETE",
              "/user/saved-searches/" + stored._id,
              { version: 1 },
              buyer,
            )
          ).status,
          404,
        );
      },
    );
    await t.test("concurrent duplicate saves store one search", async () => {
      const results = await Promise.all([
        save({ title: "Same book" }),
        save({ title: "Same book", sort: "newest" }),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    });
    await t.test(
      "concurrent saves cannot exceed the per-account cap",
      async () => {
        const results = await Promise.all(
          Array.from({ length: 28 }, (_, index) =>
            save({ q: "request" + index }, other),
          ),
        );
        assert.equal(results.filter((r) => r.status === 201).length, 25);
        assert.equal(results.filter((r) => r.status === 409).length, 3);
        const record = await (
          await request("GET", "/user/saved-searches", undefined, other)
        ).json();
        assert.equal(record.count, 25);
        assert.equal(record.limit, 25);
        assert.equal(
          new Set(record.searches.map((item) => item.query.q)).size,
          25,
        );
      },
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
