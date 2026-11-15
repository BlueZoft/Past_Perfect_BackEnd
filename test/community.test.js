const { test } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
process.env.IMAGE_DRIVER = "local";
process.env.CATALOGUE_FILE = require("path").join(
  __dirname,
  "../config/catalogue.json",
);
process.env.WEB_ORIGIN = "http://localhost:3000";
test("community discovery, profiles, private favourites and participant-only enquiries", async (t) => {
  await mongoose.connect(
    process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27017",
    {
      dbName:
        "pastperfect_test_" + require("crypto").randomBytes(8).toString("hex"),
    },
  );
  const app = require("../app");
  const Offer = require("../models/Offer");
  const Favourite = require("../models/Favourite");
  const Enquiry = require("../models/Enquiry");
  await Promise.all([Favourite.init(), Enquiry.init()]);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  const request = (method, url, body, cookie) =>
    fetch(base + url, {
      method,
      headers: {
        Origin: process.env.WEB_ORIGIN,
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  const create = async (name) => {
    const r = await request("POST", "/user/signup", {
      email: name + "@example.invalid",
      username: name,
      password: "a-strong-test-password",
    });
    assert.equal(r.status, 201);
    return {
      user: await r.json(),
      cookie: r.headers.get("set-cookie").split(";")[0],
    };
  };
  try {
    const seller = await create("seller"),
      buyer = await create("buyer"),
      stranger = await create("stranger");
    const listing = await Offer.create({
      title: "A useful book",
      description: "A useful second-hand book",
      price: 500,
      condition: "Used",
      category: "books",
      district: "sample-district",
      town: "Example town",
      owner: seller.user._id,
    });
    let thread;
    await t.test(
      "catalogue identifies placeholder geography and listing filters work",
      async () => {
        const data = await (await request("GET", "/catalogue")).json();
        assert.equal(data.locations[0].id, "sample-district");
        assert.equal(
          (
            await (
              await request(
                "GET",
                "/offers?category=books&district=sample-district&town=Example%20town",
              )
            ).json()
          ).count,
          1,
        );
        assert.equal(
          (await (await request("GET", "/offers?category=electronics")).json())
            .count,
          0,
        );
        for (const url of [
          "/offers?category=unknown",
          "/offers?district=unknown",
          "/offers?town=Example%20town",
          "/offers?district[$ne]=x",
        ])
          assert.equal((await request("GET", url)).status, 400);
      },
    );
    await t.test(
      "category-specific size and location are validated on publish/edit",
      async () => {
        const payload = {
          title: "Updated book",
          description: "A useful second-hand book",
          price: 500,
          condition: "Used",
          category: "books",
          district: "sample-district",
          town: "Unknown town",
          version: listing.__v,
        };
        assert.equal(
          (
            await request(
              "PATCH",
              "/offer/" + listing._id,
              payload,
              seller.cookie,
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await request(
              "PATCH",
              "/offer/" + listing._id,
              { ...payload, town: "Example town", size: "M" },
              seller.cookie,
            )
          ).status,
          400,
        );
      },
    );
    await t.test(
      "public profile excludes private fields and cannot be changed for another user",
      async () => {
        let r = await request(
          "PATCH",
          "/user/profile",
          { username: "Seller name", bio: "Public seller bio" },
          seller.cookie,
        );
        assert.equal(r.status, 200);
        const profile = await (
          await request("GET", "/seller/" + seller.user._id)
        ).json();
        assert.equal(profile.count, 1);
        assert.equal(profile.seller.account.bio, "Public seller bio");
        assert.equal(profile.seller.email, undefined);
        assert.equal(profile.seller.hash, undefined);
        r = await request(
          "PATCH",
          "/user/profile",
          { username: "Hacked", bio: "", user: seller.user._id },
          stranger.cookie,
        );
        assert.equal(r.status, 400);
        assert.equal(
          (
            await request(
              "PATCH",
              "/user/profile",
              { username: "", bio: "" },
              seller.cookie,
            )
          ).status,
          400,
        );
        assert.equal(
          (await request("PATCH", "/user/profile", { username: "X", bio: "" }))
            .status,
          401,
        );
      },
    );
    await t.test(
      "favourites are private, idempotent and paginated",
      async () => {
        const url = "/user/favourites/" + listing._id;
        const saves = await Promise.all([
          request("PUT", url, undefined, buyer.cookie),
          request("PUT", url, undefined, buyer.cookie),
        ]);
        assert.deepEqual(
          saves.map((r) => r.status),
          [204, 204],
        );
        assert.equal(
          await Favourite.countDocuments({ user: buyer.user._id }),
          1,
        );
        assert.equal(
          (await (await request("GET", url, undefined, buyer.cookie)).json())
            .saved,
          true,
        );
        assert.equal(
          (
            await (
              await request(
                "GET",
                "/user/favourites?limit=1",
                undefined,
                buyer.cookie,
              )
            ).json()
          ).count,
          1,
        );
        assert.equal(
          (
            await (
              await request(
                "GET",
                "/user/favourites",
                undefined,
                stranger.cookie,
              )
            ).json()
          ).count,
          0,
        );
        assert.equal((await request("GET", "/user/favourites")).status, 401);
      },
    );
    await t.test(
      "new enquiry uses authenticated buyer and listing seller and refuses self-contact",
      async () => {
        assert.equal(
          (
            await request(
              "POST",
              "/offer/" + listing._id + "/enquiries",
              { message: "Interested" },
              seller.cookie,
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await request(
              "POST",
              "/offer/" + listing._id + "/enquiries",
              { message: "Interested", seller: stranger.user._id },
              buyer.cookie,
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await request(
              "POST",
              "/offer/" + listing._id + "/enquiries",
              { message: "  " },
              buyer.cookie,
            )
          ).status,
          400,
        );
        const r = await request(
          "POST",
          "/offer/" + listing._id + "/enquiries",
          { message: "Is this available?" },
          buyer.cookie,
        );
        assert.equal(r.status, 201);
        thread = (await r.json())._id;
        const again = await request(
          "POST",
          "/offer/" + listing._id + "/enquiries",
          { message: "Can I collect it?" },
          buyer.cookie,
        );
        assert.equal((await again.json())._id, thread);
        assert.equal(await Enquiry.countDocuments(), 1);
      },
    );
    await t.test(
      "only the two participants can list, read and reply to an enquiry",
      async () => {
        assert.equal(
          (
            await (
              await request("GET", "/user/enquiries", undefined, seller.cookie)
            ).json()
          ).count,
          1,
        );
        assert.equal(
          (
            await (
              await request(
                "GET",
                "/user/enquiries",
                undefined,
                stranger.cookie,
              )
            ).json()
          ).count,
          0,
        );
        const url = "/enquiry/" + thread + "/messages";
        assert.equal(
          (await request("GET", url, undefined, stranger.cookie)).status,
          404,
        );
        assert.equal(
          (
            await request(
              "POST",
              url,
              { message: "Intrusion" },
              stranger.cookie,
            )
          ).status,
          404,
        );
        assert.equal((await request("GET", url)).status, 401);
        assert.equal(
          (
            await request(
              "POST",
              url,
              { message: "Yes, it is available." },
              seller.cookie,
            )
          ).status,
          201,
        );
        const messages = await (
          await request("GET", url + "?limit=2&page=2", undefined, buyer.cookie)
        ).json();
        assert.equal(messages.count, 3);
        assert.equal(messages.messages.length, 1);
        assert.equal(messages.messages[0].text, "Yes, it is available.");
        assert.equal(messages.enquiry.seller.email, undefined);
        assert.equal(messages.enquiry.buyer.hash, undefined);
        assert.equal(
          (
            await request(
              "POST",
              url,
              { message: "x".repeat(2001) },
              buyer.cookie,
            )
          ).status,
          400,
        );
      },
    );
    await t.test(
      "non-active listings reject new enquiries; existing conversations survive removal",
      async () => {
        await Offer.updateOne(
          { _id: listing._id },
          { $set: { status: "removed" } },
        );
        assert.equal(
          (
            await request(
              "POST",
              "/offer/" + listing._id + "/enquiries",
              { message: "New enquiry" },
              stranger.cookie,
            )
          ).status,
          404,
        );
        assert.equal(
          (
            await (
              await request("GET", "/user/favourites", undefined, buyer.cookie)
            ).json()
          ).count,
          0,
        );
        assert.equal(
          (await (await request("GET", "/seller/" + seller.user._id)).json())
            .count,
          0,
        );
        assert.equal(
          (
            await request(
              "PUT",
              "/user/favourites/" + listing._id,
              undefined,
              buyer.cookie,
            )
          ).status,
          404,
        );
        assert.equal(
          (
            await request(
              "POST",
              "/enquiry/" + thread + "/messages",
              { message: "Thanks for letting me know" },
              buyer.cookie,
            )
          ).status,
          201,
        );
        assert.equal(
          (
            await request(
              "DELETE",
              "/user/favourites/" + listing._id,
              undefined,
              buyer.cookie,
            )
          ).status,
          204,
        );
        assert.equal(
          await Favourite.countDocuments({ user: buyer.user._id }),
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
