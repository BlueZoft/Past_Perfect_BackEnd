const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const mongoose = require("mongoose");
const sharp = require("sharp");
process.env.IMAGE_DRIVER = "local";
process.env.CATALOGUE_FILE = path.join(__dirname, "../config/catalogue.json");
test("typed attributes enforce category boundaries and preserve types", () => {
  const { validateAttributes } = require("../lib/listings");
  assert.deepEqual(
    validateAttributes("electronics", { brand: " Example ", model: "Model 1" }),
    { brand: "Example", model: "Model 1" },
  );
  assert.deepEqual(
    validateAttributes("furniture", '{"widthCm":"125.5","heightCm":80}'),
    { widthCm: 125.5, heightCm: 80 },
  );
  for (const [category, value] of [
    ["books", { brand: "wrong category" }],
    ["electronics", { brand: { $gt: "" } }],
    ["other", JSON.parse('{"__proto__":{"admin":true}}')],
    ["furniture", { widthCm: -1 }],
    ["furniture", { widthCm: true }],
    ["books", "bad json"],
    ["books", { author: "a".repeat(121) }],
  ])
    assert.throws(() => validateAttributes(category, value));
});
test("sanitized WebP output, avatar sizing and conservative local orphan cleanup", async (t) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "pastperfect-images-"),
  );
  process.env.UPLOAD_DIR = directory;
  await mongoose.connect(
    process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27017",
    {
      dbName:
        "pastperfect_test_" + require("crypto").randomBytes(8).toString("hex"),
    },
  );
  const images = require("../services/images");
  const Offer = require("../models/Offer");
  const User = require("../models/User");
  await require("../models/AssetCleanup").init();
  let saved;
  try {
    const source = await sharp({
      create: { width: 3000, height: 1000, channels: 3, background: "#336699" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    await t.test(
      "decode, rotation, size bounds and metadata removal",
      async () => {
        saved = await images.save({ buffer: source });
        assert.equal(saved.driver, "local");
        assert.ok(saved.publicId.endsWith(".webp"));
        assert.ok(saved.width <= 1920 && saved.height <= 1920);
        assert.equal(
          saved.bytes,
          (await fs.stat(path.join(directory, saved.publicId))).size,
        );
        const metadata = await sharp(
          path.join(directory, saved.publicId),
        ).metadata();
        assert.equal(metadata.format, "webp");
        assert.equal(metadata.exif, undefined);
        assert.equal(metadata.orientation, undefined);
        assert.ok(metadata.height > metadata.width);
        const avatar = await images.save({ buffer: source }, { avatar: true });
        assert.ok(avatar.width <= 512 && avatar.height <= 512);
      },
    );
    await t.test(
      "reject corrupt payloads and excessive input dimensions",
      async () => {
        const png = await sharp({
          create: { width: 30, height: 30, channels: 3, background: "red" },
        })
          .png()
          .toBuffer();
        await assert.rejects(images.save({ buffer: png.subarray(0, 40) }), {
          status: 400,
        });
        const huge = await sharp({
          create: {
            width: 6000,
            height: 4000,
            channels: 3,
            background: "white",
          },
        })
          .jpeg()
          .toBuffer();
        await assert.rejects(images.validate({ buffer: huge }), {
          status: 400,
        });
      },
    );
    await t.test(
      "orphan dry-run preserves referenced, recent, foreign-named and symlink files",
      async () => {
        const user = await User.create({
          email: "image-test@example.invalid",
          account: { username: "Tester" },
          hash: "test-fixture-hash",
        });
        await Offer.create({
          owner: user._id,
          title: "Reference image",
          description: "An image reference for testing",
          condition: "Used",
          price: 100,
          images: [saved],
          category: "books",
          attributes: { author: "Example author" },
        });
        const document = await Offer.findOne({ owner: user._id });
        assert.equal(document.toJSON().attributes.author, "Example author");
        const orphan = await images.save({ buffer: source });
        const recent = await images.save({ buffer: source });
        const old = new Date(Date.now() - 48 * 3600000);
        await fs.utimes(path.join(directory, orphan.publicId), old, old);
        await fs.utimes(path.join(directory, saved.publicId), old, old);
        await fs.writeFile(path.join(directory, "unrelated.txt"), "keep");
        await fs.symlink(
          path.join(directory, "unrelated.txt"),
          path.join(directory, "11111111-1111-1111-1111-111111111111.webp"),
        );
        const scan = require("../services/localOrphans").scan;
        let result = await scan();
        assert.equal(result.mode, "dry-run");
        assert.equal(result.eligible, 1);
        await fs.access(path.join(directory, orphan.publicId));
        result = await scan({ apply: true });
        assert.equal(result.queued, 1);
        await assert.rejects(fs.access(path.join(directory, orphan.publicId)));
        await fs.access(path.join(directory, saved.publicId));
        await fs.access(path.join(directory, recent.publicId));
        await fs.access(path.join(directory, "unrelated.txt"));
        assert.equal((await scan()).eligible, 0);
      },
    );
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
