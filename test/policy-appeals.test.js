const { test } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const path = require("path");
process.env.IMAGE_DRIVER = "local";
process.env.MAIL_DRIVER = "disabled";
process.env.CATALOGUE_FILE = path.join(__dirname, "../config/catalogue.json");
process.env.POLICY_FILE = path.join(__dirname, "../config/policy.json");
process.env.WEB_ORIGIN = "http://localhost:3000";
test("account moderation, appeal atomicity and configurable policy review", async (t) => {
  await mongoose.connect(
    process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27017",
    {
      dbName:
        "pastperfect_test_" + require("crypto").randomBytes(8).toString("hex"),
    },
  );
  const app = require("../app"),
    User = require("../models/User"),
    Offer = require("../models/Offer");
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
  const create = async (name) => {
    const r = await request("POST", "/user/signup", {
      email: name + "@example.invalid",
      username: name,
      password: "a-secure-test-password",
    });
    assert.equal(r.status, 201);
    return {
      user: await r.json(),
      cookie: r.headers.get("set-cookie").split(";")[0],
    };
  };
  const login = async (actor) => {
    const r = await request("POST", "/user/login", {
      email: actor.user.email,
      password: "a-secure-test-password",
    });
    assert.equal(r.status, 200);
    actor.user = await r.json();
    actor.cookie = r.headers.get("set-cookie").split(";")[0];
  };
  try {
    const seller = await create("seller"),
      buyer = await create("buyer"),
      admin = await create("admin");
    process.env.ADMIN_USER_IDS = admin.user._id;
    const listing = await Offer.create({
      owner: seller.user._id,
      title: "An ordinary book",
      description: "A useful second hand book",
      price: 100,
      condition: "Used",
    });
    let appeal;
    await request(
      "PUT",
      "/user/favourites/" + listing._id,
      undefined,
      buyer.cookie,
    );
    const thread = (
      await (
        await request(
          "POST",
          "/offer/" + listing._id + "/enquiries",
          { message: "Hello seller" },
          buyer.cookie,
        )
      ).json()
    )._id;
    await t.test(
      "only admins can suspend and admin accounts cannot be locked out",
      async () => {
        const payload = {
          suspended: true,
          reason: "Review needed",
          version: 0,
        };
        assert.equal(
          (
            await request(
              "PATCH",
              "/admin/users/" + seller.user._id + "/moderation",
              payload,
              buyer.cookie,
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await request(
              "PATCH",
              "/admin/users/" + admin.user._id + "/moderation",
              payload,
              admin.cookie,
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await request(
              "PATCH",
              "/admin/users/" + seller.user._id + "/moderation",
              payload,
              admin.cookie,
            )
          ).status,
          200,
        );
        assert.equal(
          (await request("GET", "/user/me", undefined, seller.cookie)).status,
          401,
        );
        await login(seller);
        assert.equal(seller.user.suspended, true);
        assert.equal(seller.user.suspensionReason, "Review needed");
      },
    );
    await t.test(
      "restricted sessions cannot publish, edit, message or access administration",
      async () => {
        for (const [method, url, body] of [
          ["GET", "/user/offers"],
          ["PATCH", "/user/profile", { username: "Changed", bio: "" }],
          ["POST", "/offer/publish", {}],
          ["POST", "/enquiry/" + thread + "/messages", { message: "Blocked" }],
          ["GET", "/admin/reports"],
        ])
          assert.equal(
            (await request(method, url, body, seller.cookie)).status,
            403,
          );
        assert.equal(
          (
            await request(
              "GET",
              "/user/notifications",
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
              "/enquiry/" + thread + "/messages",
              { message: "Hello" },
              buyer.cookie,
            )
          ).status,
          403,
        );
      },
    );
    await t.test(
      "suspended sellers disappear from all public discovery and favourite counts",
      async () => {
        assert.equal(
          (await request("GET", "/offer/" + listing._id)).status,
          404,
        );
        assert.equal(
          (await request("GET", "/seller/" + seller.user._id)).status,
          404,
        );
        assert.equal((await (await request("GET", "/offers")).json()).count, 0);
        assert.equal(
          (
            await (
              await request("GET", "/user/favourites", undefined, buyer.cookie)
            ).json()
          ).count,
          0,
        );
        assert.equal(
          (
            await request(
              "POST",
              "/offer/" + listing._id + "/enquiries",
              { message: "Contact" },
              buyer.cookie,
            )
          ).status,
          404,
        );
      },
    );
    await t.test(
      "one appeal per suspension version, scoped to the requesting account",
      async () => {
        const payload = {
          text: "Please review the account suspension",
          version: seller.user.moderationVersion,
        };
        const results = await Promise.all([
          request("POST", "/user/appeals", payload, seller.cookie),
          request("POST", "/user/appeals", payload, seller.cookie),
        ]);
        assert.deepEqual(results.map((r) => r.status).sort(), [200, 201]);
        appeal = await results[0].json();
        assert.equal(
          (
            await (
              await request("GET", "/user/appeals", undefined, seller.cookie)
            ).json()
          ).count,
          1,
        );
        assert.equal(
          (
            await (
              await request("GET", "/user/appeals", undefined, buyer.cookie)
            ).json()
          ).count,
          0,
        );
        assert.equal(
          (
            await request(
              "POST",
              "/user/appeals",
              { ...payload, version: 0 },
              seller.cookie,
            )
          ).status,
          409,
        );
        const queue = await (
          await request("GET", "/admin/appeals", undefined, admin.cookie)
        ).json();
        assert.equal(queue.count, 1);
        assert.equal(queue.appeals[0].user.email, undefined);
        assert.equal(queue.appeals[0].user.authVersion, undefined);
      },
    );
    await t.test(
      "appeal acceptance atomically restores the account and rejects duplicate decisions",
      async () => {
        const payload = {
          decision: "accepted",
          resolution: "Reviewed and restored",
          version: appeal.moderationVersion,
        };
        const results = await Promise.all([
          request(
            "PATCH",
            "/admin/appeals/" + appeal._id,
            payload,
            admin.cookie,
          ),
          request(
            "PATCH",
            "/admin/appeals/" + appeal._id,
            payload,
            admin.cookie,
          ),
        ]);
        assert.deepEqual(results.map((r) => r.status).sort(), [204, 409]);
        assert.equal(
          (await request("GET", "/user/me", undefined, seller.cookie)).status,
          401,
        );
        await login(seller);
        assert.equal(seller.user.suspended, false);
        const own = await (
          await request("GET", "/user/appeals", undefined, seller.cookie)
        ).json();
        assert.equal(own.appeals[0].status, "accepted");
        assert.equal((await (await request("GET", "/offers")).json()).count, 1);
      },
    );
    await t.test(
      "rejected appeals do not restore accounts; manual restoration closes current appeals",
      async () => {
        let r = await request(
          "PATCH",
          "/admin/users/" + seller.user._id + "/moderation",
          {
            suspended: true,
            reason: "Second review",
            version: seller.user.moderationVersion,
          },
          admin.cookie,
        );
        assert.equal(r.status, 200);
        await login(seller);
        r = await request(
          "POST",
          "/user/appeals",
          {
            text: "Please reconsider this second review",
            version: seller.user.moderationVersion,
          },
          seller.cookie,
        );
        const next = await r.json();
        assert.equal(r.status, 201);
        assert.equal(
          (
            await request(
              "PATCH",
              "/admin/appeals/" + next._id,
              {
                decision: "rejected",
                resolution: "Decision upheld",
                version: next.moderationVersion,
              },
              admin.cookie,
            )
          ).status,
          204,
        );
        assert.equal(
          (
            await (
              await request("GET", "/user/me", undefined, seller.cookie)
            ).json()
          ).suspended,
          true,
        );
        assert.equal(
          (
            await request(
              "PATCH",
              "/admin/users/" + seller.user._id + "/moderation",
              {
                suspended: false,
                reason: "Manual restoration",
                version: seller.user.moderationVersion,
              },
              admin.cookie,
            )
          ).status,
          200,
        );
        await login(seller);
        assert.equal(
          (
            await request(
              "PATCH",
              "/admin/appeals/" + next._id,
              {
                decision: "accepted",
                resolution: "Stale restore",
                version: next.moderationVersion,
              },
              admin.cookie,
            )
          ).status,
          409,
        );
      },
    );
    await t.test(
      "policy rejects configured literal terms and queues review matches on edits",
      async () => {
        const policy = await (await request("GET", "/policy")).json();
        assert.equal(policy.version, "placeholder-v1");
        assert.ok(policy.notice.si && policy.notice.ta);
        const fields = {
          title: "example-prohibited-item",
          description: "A detailed listing description",
          price: 100,
          condition: "Used",
          size: "",
          version: 0,
        };
        assert.equal(
          (
            await request(
              "PATCH",
              "/offer/" + listing._id,
              fields,
              seller.cookie,
            )
          ).status,
          400,
        );
        const r = await request(
          "PATCH",
          "/offer/" + listing._id,
          { ...fields, title: "example-review-item" },
          seller.cookie,
        );
        assert.equal(r.status, 200);
        const updated = await r.json();
        assert.equal(updated.policyReview, true);
        assert.equal(updated.moderationHidden, true);
        assert.equal(
          (await request("GET", "/offer/" + listing._id)).status,
          404,
        );
        assert.equal(
          (
            await (
              await request(
                "GET",
                "/admin/policy-listings",
                undefined,
                admin.cookie,
              )
            ).json()
          ).count,
          1,
        );
        assert.equal(
          (
            await request(
              "PATCH",
              "/admin/offers/" + listing._id + "/moderation",
              {
                hidden: false,
                reason: "Policy reviewed",
                version: updated.__v,
              },
              admin.cookie,
            )
          ).status,
          200,
        );
        assert.equal(
          (await request("GET", "/offer/" + listing._id)).status,
          200,
        );
        assert.equal(
          (
            await (
              await request(
                "GET",
                "/admin/policy-listings",
                undefined,
                admin.cookie,
              )
            ).json()
          ).count,
          0,
        );
      },
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
