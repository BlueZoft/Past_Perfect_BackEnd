const { test } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
test("media ownership, cleanup, blocking, reporting and admin moderation", async (t) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "pastperfect-safety-"),
  );
  process.env.UPLOAD_DIR = directory;
  process.env.IMAGE_DRIVER = "local";
  process.env.CATALOGUE_FILE = path.join(__dirname, "../config/catalogue.json");
  process.env.WEB_ORIGIN = "http://localhost:3000";
  const dbName =
    "pastperfect_test_" + require("crypto").randomBytes(8).toString("hex");
  await mongoose.connect(
    process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27017",
    { dbName },
  );
  const app = require("../app"),
    Offer = require("../models/Offer"),
    Report = require("../models/Report"),
    Block = require("../models/Block"),
    images = require("../services/images"),
    cleanup = require("../services/mediaCleanup");
  await Promise.all([
    Report.init(),
    Block.init(),
    require("../models/AssetCleanup").init(),
  ]);
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
      password: "test-secure-password",
      username: name,
    });
    assert.equal(r.status, 201);
    return {
      user: await r.json(),
      cookie: r.headers.get("set-cookie").split(";")[0],
    };
  };
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  );
  const upload = (url, version, cookie, field = "images", buffer = png) => {
    const form = new FormData();
    form.set("version", String(version));
    form.set(field, new Blob([buffer], { type: "image/png" }), "photo.png");
    return fetch(base + url, {
      method: "PUT",
      headers: { Origin: process.env.WEB_ORIGIN, Cookie: cookie },
      body: form,
    });
  };
  try {
    const seller = await create("seller"),
      buyer = await create("buyer"),
      admin = await create("admin");
    process.env.ADMIN_USER_IDS = String(admin.user._id);
    const original = await images.save({ buffer: png });
    let listing = await Offer.create({
      title: "Test book",
      description: "A good used test book",
      price: 100,
      condition: "Used",
      owner: seller.user._id,
      images: [original],
    });
    let thread, reportId;
    await t.test(
      "photo replacement is owner-only, bounded and version checked",
      async () => {
        assert.equal(
          (await upload("/offer/" + listing._id + "/images", 0, buyer.cookie))
            .status,
          404,
        );
        assert.equal(
          (
            await upload(
              "/offer/" + listing._id + "/images",
              0,
              seller.cookie,
              "images",
              Buffer.from("bad"),
            )
          ).status,
          400,
        );
        let r = await upload(
          "/offer/" + listing._id + "/images",
          0,
          seller.cookie,
        );
        assert.equal(r.status, 200);
        listing = await r.json();
        assert.equal(listing.__v, 1);
        assert.equal(listing.images.length, 1);
        await assert.rejects(
          fs.access(path.join(directory, original.publicId)),
        );
        const before = (await fs.readdir(directory)).length;
        assert.equal(
          (await upload("/offer/" + listing._id + "/images", 0, seller.cookie))
            .status,
          409,
        );
        assert.equal((await fs.readdir(directory)).length, before);
        assert.equal((await fetch(base + listing.images[0].url)).status, 200);
      },
    );
    await t.test(
      "avatar updates are private, versioned, validated and old assets are removed",
      async () => {
        let r = await upload("/user/avatar", 0, seller.cookie, "avatar");
        assert.equal(r.status, 200);
        let body = await r.json();
        assert.equal(body.avatarVersion, 1);
        const first = body.account.avatar.publicId;
        assert.equal(
          (await upload("/user/avatar", 0, seller.cookie, "avatar")).status,
          409,
        );
        r = await upload("/user/avatar", 1, seller.cookie, "avatar");
        assert.equal(r.status, 200);
        body = await r.json();
        assert.equal(body.avatarVersion, 2);
        await assert.rejects(fs.access(path.join(directory, first)));
        r = await request(
          "DELETE",
          "/user/avatar",
          { version: 2 },
          seller.cookie,
        );
        assert.equal(r.status, 200);
        body = await r.json();
        assert.equal(body.avatarVersion, 3);
        assert.equal(body.account.avatar, undefined);
      },
    );
    await t.test(
      "cleanup retries provider failures and protects referenced images",
      async () => {
        const orphan = await images.save({ buffer: png });
        await cleanup.schedule([orphan]);
        const remove = images.remove;
        try {
          images.remove = async () => {
            throw new Error("temporary storage failure");
          };
          await cleanup.drain();
          assert.ok(
            await require("../models/AssetCleanup").exists({
              publicId: orphan.publicId,
            }),
          );
        } finally {
          images.remove = remove;
        }
        await cleanup.schedule(listing.images);
        await cleanup.drain();
        await assert.rejects(fs.access(path.join(directory, orphan.publicId)));
        assert.equal((await fetch(base + listing.images[0].url)).status, 200);
      },
    );
    await t.test(
      "cleanup refuses deletion through the wrong storage provider",
      async () => {
        const foreign = await images.save({ buffer: png });
        await cleanup.schedule([{ ...foreign, driver: "cloudinary" }]);
        await cleanup.drain();
        await fs.access(path.join(directory, foreign.publicId));
        assert.ok(
          await require("../models/AssetCleanup").exists({
            publicId: foreign.publicId,
            driver: "cloudinary",
            attempts: { $gte: 1 },
          }),
        );
      },
    );
    await t.test(
      "blocking prevents new enquiries and replies in both directions, preserving history",
      async () => {
        let r = await request(
          "POST",
          "/offer/" + listing._id + "/enquiries",
          { message: "Hello" },
          buyer.cookie,
        );
        thread = (await r.json())._id;
        assert.equal(
          (
            await request(
              "PUT",
              "/user/blocks/" + buyer.user._id,
              undefined,
              seller.cookie,
            )
          ).status,
          204,
        );
        assert.equal(
          (
            await request(
              "PUT",
              "/user/blocks/" + seller.user._id.toUpperCase(),
              undefined,
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
              { message: "Hello again" },
              buyer.cookie,
            )
          ).status,
          403,
        );
        for (const cookie of [seller.cookie, buyer.cookie])
          assert.equal(
            (
              await request(
                "POST",
                "/enquiry/" + thread + "/messages",
                { message: "Blocked" },
                cookie,
              )
            ).status,
            403,
          );
        assert.equal(
          (
            await request(
              "GET",
              "/enquiry/" + thread + "/messages",
              undefined,
              buyer.cookie,
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await (
              await request("GET", "/user/blocks", undefined, buyer.cookie)
            ).json()
          ).count,
          0,
        );
        assert.equal(
          (
            await request(
              "DELETE",
              "/user/blocks/" + buyer.user._id,
              undefined,
              seller.cookie,
            )
          ).status,
          204,
        );
        assert.equal(
          (
            await request(
              "POST",
              "/enquiry/" + thread + "/messages",
              { message: "Seller response" },
              seller.cookie,
            )
          ).status,
          201,
        );
      },
    );
    await t.test(
      "reports validate target visibility and message participation, and deduplicate",
      async () => {
        const messages = await (
          await request(
            "GET",
            "/enquiry/" + thread + "/messages",
            undefined,
            buyer.cookie,
          )
        ).json();
        const message = messages.messages.find(
          (item) => String(item.sender) === String(seller.user._id),
        );
        const payload = {
          targetType: "message",
          target: message._id,
          reason: "harassment",
          details: "Review this response",
        };
        assert.equal(
          (await request("POST", "/reports", payload, admin.cookie)).status,
          404,
        );
        assert.equal(
          (await request("POST", "/reports", payload, buyer.cookie)).status,
          201,
        );
        const listingReport = {
          targetType: "listing",
          target: String(listing._id),
          reason: "scam",
          details: "Please review",
        };
        let r = await request("POST", "/reports", listingReport, buyer.cookie);
        assert.equal(r.status, 201);
        reportId = (await r.json())._id;
        assert.equal(
          (
            await (
              await request("POST", "/reports", listingReport, buyer.cookie)
            ).json()
          )._id,
          reportId,
        );
        assert.equal(
          (
            await request(
              "POST",
              "/reports",
              { ...listingReport, target: [listing._id] },
              buyer.cookie,
            )
          ).status,
          400,
        );
        assert.equal(
          (await request("GET", "/admin/reports", undefined, buyer.cookie))
            .status,
          403,
        );
      },
    );
    await t.test(
      "admin allowlist cannot be granted through profile data",
      async () => {
        assert.equal(
          (
            await request(
              "PATCH",
              "/user/profile",
              { username: "Buyer", bio: "", isAdmin: true },
              buyer.cookie,
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await (
              await request("GET", "/user/me", undefined, buyer.cookie)
            ).json()
          ).isAdmin,
          false,
        );
        assert.equal(
          (
            await (
              await request("GET", "/user/me", undefined, admin.cookie)
            ).json()
          ).isAdmin,
          true,
        );
      },
    );
    await t.test(
      "admin visibility overrides owners, public discovery and favourites",
      async () => {
        await request(
          "PUT",
          "/user/favourites/" + listing._id,
          undefined,
          buyer.cookie,
        );
        let r = await request(
          "PATCH",
          "/admin/offers/" + listing._id + "/moderation",
          { hidden: true, reason: "Under review", version: listing.__v },
          admin.cookie,
        );
        assert.equal(r.status, 200);
        listing = await r.json();
        assert.equal(listing.moderationAudit.length, 1);
        assert.equal(
          (await request("GET", "/offer/" + listing._id)).status,
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
              "GET",
              "/user/offers/" + listing._id,
              undefined,
              seller.cookie,
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await request(
              "PATCH",
              "/offer/" + listing._id + "/status",
              { status: "reserved", version: listing.__v },
              seller.cookie,
            )
          ).status,
          409,
        );
        assert.equal(
          (
            await upload(
              "/offer/" + listing._id + "/images",
              listing.__v,
              seller.cookie,
            )
          ).status,
          409,
        );
        assert.equal(
          (
            await request(
              "POST",
              "/offer/" + listing._id + "/enquiries",
              { message: "New contact" },
              buyer.cookie,
            )
          ).status,
          404,
        );
        r = await request(
          "PATCH",
          "/admin/offers/" + listing._id + "/moderation",
          {
            hidden: false,
            reason: "Reviewed and restored",
            version: listing.__v,
          },
          admin.cookie,
        );
        assert.equal(r.status, 200);
        listing = await r.json();
        const publicData = await (
          await request("GET", "/offer/" + listing._id)
        ).json();
        assert.equal(publicData.moderationAudit, undefined);
        const favourites = await (
          await request("GET", "/user/favourites", undefined, buyer.cookie)
        ).json();
        assert.equal(favourites.offers[0].moderationAudit, undefined);
      },
    );
    await t.test(
      "report decisions require notes and reject stale or repeated reviews",
      async () => {
        const queue = await (
          await request("GET", "/admin/reports", undefined, admin.cookie)
        ).json();
        const report = queue.reports.find((item) => item._id === reportId);
        assert.equal(
          (
            await request(
              "PATCH",
              "/admin/reports/" + reportId,
              { status: "resolved", resolution: "", version: report.__v },
              admin.cookie,
            )
          ).status,
          400,
        );
        const payload = {
          status: "resolved",
          resolution: "Reviewed listing and restored visibility",
          version: report.__v,
        };
        assert.equal(
          (
            await request(
              "PATCH",
              "/admin/reports/" + reportId,
              payload,
              admin.cookie,
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await request(
              "PATCH",
              "/admin/reports/" + reportId,
              payload,
              admin.cookie,
            )
          ).status,
          409,
        );
      },
    );
    await t.test(
      "report and moderation notifications link to recipient-scoped pages",
      async () => {
        const buyerNotices = await (
          await request("GET", "/user/notifications", undefined, buyer.cookie)
        ).json();
        assert.ok(
          buyerNotices.notifications.some(
            (item) => item.type === "report" && item.link === "/reports",
          ),
        );
        const sellerNotices = await (
          await request("GET", "/user/notifications", undefined, seller.cookie)
        ).json();
        assert.ok(
          sellerNotices.notifications.some(
            (item) =>
              item.type === "moderation" && item.link === "/my-listings",
          ),
        );
        const ownReports = await (
          await request("GET", "/user/reports", undefined, buyer.cookie)
        ).json();
        assert.equal(ownReports.count, 2);
        assert.equal(ownReports.reports[0].snapshot, undefined);
        assert.equal(ownReports.reports[0].resolution, undefined);
        assert.equal(
          (
            await (
              await request("GET", "/user/reports", undefined, seller.cookie)
            ).json()
          ).count,
          0,
        );
      },
    );
    await t.test(
      "retention maintenance defaults to dry-run and applies only expired removed media",
      async () => {
        await Offer.updateOne(
          { _id: listing._id },
          {
            $set: {
              status: "removed",
              removedAt: new Date(Date.now() - 40 * 86400000),
            },
          },
        );
        const { promisify } = require("util");
        const exec = promisify(require("child_process").execFile);
        const uri = new URL(
          process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27017",
        );
        uri.pathname = "/" + dbName;
        const options = {
          cwd: path.join(__dirname, ".."),
          env: {
            ...process.env,
            MONGODB_URI: uri.toString(),
            MEDIA_RETENTION_DAYS: "30",
          },
        };
        let result = await exec(
          process.execPath,
          ["scripts/media-maintenance.js"],
          options,
        );
        assert.equal(JSON.parse(result.stdout).mode, "dry-run");
        assert.equal((await Offer.findById(listing._id)).images.length, 1);
        result = await exec(
          process.execPath,
          ["scripts/media-maintenance.js", "--apply"],
          options,
        );
        assert.equal(JSON.parse(result.stdout).purgedListings, 1);
        assert.equal((await Offer.findById(listing._id)).images.length, 0);
        await assert.rejects(
          fs.access(path.join(directory, listing.images[0].publicId)),
        );
      },
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
