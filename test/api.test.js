const { test } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { listQuery, validateListing } = require("../lib/listings");
test("search treats regex characters literally and bounds queries", () => {
  const regex = listQuery({ title: ".*[x]" }).filter.title;
  assert.equal(regex.test("anything"), false);
  assert.equal(regex.test("an .*[x] item"), true);
  for (const query of [
    { limit: "0" },
    { limit: "51" },
    { page: "-1" },
    { priceMin: "20", priceMax: "10" },
    { title: { $ne: "" } },
  ])
    assert.throws(() => listQuery(query));
  assert.equal(listQuery({}).limit, 10);
  assert.equal(
    validateListing({
      title: "පරණ පොත",
      description: "தமிழ் புத்தகம் விவரம்",
      price: 500,
      condition: "Used",
    }).price,
    500,
  );
  assert.throws(() =>
    validateListing({
      title: "Valid title",
      description: "Valid description",
      price: -1,
      condition: "Used",
    }),
  );
});
test("API authentication, publishing, discovery and session lifecycle", async (t) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "pastperfect-test-"),
  );
  process.env.UPLOAD_DIR = directory;
  process.env.IMAGE_DRIVER = "local";
  const origin = "http://localhost:3000";
  process.env.WEB_ORIGIN = origin;
  // A unique disposable database; never drop configured development data.
  const dbName =
    "pastperfect_test_" + require("crypto").randomBytes(8).toString("hex");
  await mongoose.connect(
    process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27017",
    { dbName },
  );
  const app = require("../app");
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  let cookie, id;
  const request = (url, body, session = cookie) =>
    fetch(base + url, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: origin,
        ...(session ? { Cookie: session } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  try {
    await t.test(
      "signup normalizes email and issues an HTTP-only cookie without tokens in JSON",
      async () => {
        const r = await request("/user/signup", {
          email: " TEST@Example.invalid ",
          password: "a-secure-test-password",
          username: "Tester",
        });
        assert.equal(r.status, 201);
        const body = await r.json();
        assert.equal(body.email, "test@example.invalid");
        assert.equal(body.token, undefined);
        const header = r.headers.get("set-cookie");
        assert.match(header, /HttpOnly/);
        assert.match(header, /SameSite=Strict/);
        cookie = header.split(";")[0];
      },
    );
    await t.test("wrong password is rejected", async () => {
      const r = await request("/user/login", {
        email: "test@example.invalid",
        password: "incorrect-password",
      });
      assert.equal(r.status, 401);
      assert.equal(r.headers.get("set-cookie"), null);
    });
    await t.test("correct password creates a session", async () => {
      const r = await request("/user/login", {
        email: "test@example.invalid",
        password: "a-secure-test-password",
      });
      assert.equal(r.status, 200);
    });
    await t.test(
      "missing origin blocks cookie-authenticated mutations",
      async () => {
        const r = await fetch(base + "/user/logout", {
          method: "POST",
          headers: { Cookie: cookie },
        });
        assert.equal(r.status, 403);
      },
    );
    await t.test("unauthenticated publishing is rejected", async () => {
      assert.equal((await request("/offer/publish", {}, "")).status, 401);
    });
    await t.test("missing images return a controlled error", async () => {
      assert.equal(
        (
          await request("/offer/publish", {
            title: "Test book",
            description: "A useful old book",
            price: 100,
            condition: "Used",
          })
        ).status,
        400,
      );
    });
    await t.test("invalid image contents are rejected", async () => {
      const form = new FormData();
      form.set("title", "Test book");
      form.set("description", "A useful old book");
      form.set("price", "100");
      form.set("condition", "Used");
      form.set(
        "picture1",
        new Blob(["not an image"], { type: "image/png" }),
        "bad.png",
      );
      assert.equal(
        (
          await fetch(base + "/offer/publish", {
            method: "POST",
            headers: { Origin: origin, Cookie: cookie },
            body: form,
          })
        ).status,
        400,
      );
    });
    await t.test(
      "publish image and retrieve the same listing contract",
      async () => {
        const form = new FormData();
        for (const [key, value] of Object.entries({
          title: "පරණ පොත",
          description: "A useful old book for testing",
          price: "100",
          condition: "Used",
        }))
          form.set(key, value);
        const png = Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
          "base64",
        );
        form.set(
          "picture1",
          new Blob([png], { type: "image/png" }),
          "book.png",
        );
        const r = await fetch(base + "/offer/publish", {
          method: "POST",
          headers: { Origin: origin, Cookie: cookie },
          body: form,
        });
        assert.equal(r.status, 201);
        const body = await r.json();
        id = body._id;
        assert.equal(body.currency, "LKR");
        assert.equal(body.owner.account.username, "Tester");
        const detail = await (await request("/offer/" + id)).json();
        assert.equal(detail.title, "පරණ පොත");
        assert.equal(detail.price, 100);
        assert.equal((await fetch(base + detail.images[0].url)).status, 200);
      },
    );
    await t.test(
      "filtering, sorting and pagination operate on database results",
      async () => {
        const Offer = require("../models/Offer");
        const source = await Offer.findById(id);
        await Offer.create({
          title: "Other book",
          description: "Another useful old book",
          price: 200,
          condition: "Used",
          owner: source.owner,
        });
        const r = await request("/offers?limit=1&page=2&sort=price-asc");
        const body = await r.json();
        assert.equal(body.count, 2);
        assert.equal(body.offers.length, 1);
        assert.equal(body.offers[0].price, 200);
        assert.equal(
          (await (await request("/offers?priceMax=150")).json()).count,
          1,
        );
        assert.equal(
          (await (await request("/offers?title=.*")).json()).count,
          0,
        );
        assert.equal((await request("/offers?limit=999")).status, 400);
        assert.equal((await request("/offer/bad")).status, 400);
      },
    );
    await t.test("payment fails closed", async () => {
      assert.equal((await request("/payment", { amount: 1 })).status, 503);
    });
    await t.test("logout revokes the server session", async () => {
      assert.equal((await request("/user/logout", {})).status, 204);
      assert.equal((await request("/user/me")).status, 401);
    });
    await t.test(
      "expired sessions are rejected before TTL cleanup",
      async () => {
        const r = await request("/user/login", {
          email: "test@example.invalid",
          password: "a-secure-test-password",
        });
        cookie = r.headers.get("set-cookie").split(";")[0];
        await require("../models/Session").updateMany(
          {},
          { $set: { expiresAt: new Date(0) } },
        );
        assert.equal((await request("/user/me")).status, 401);
      },
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
