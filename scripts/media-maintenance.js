// Dry-run by default. Applying must be an explicit operator decision.
const mongoose = require("mongoose");
const config = require("../lib/config");
const Offer = require("../models/Offer");
const AssetCleanup = require("../models/AssetCleanup");
const cleanup = require("../services/mediaCleanup");
async function run() {
  const days = Number(process.env.MEDIA_RETENTION_DAYS || 30);
  if (!Number.isSafeInteger(days) || days < 1)
    throw new Error("MEDIA_RETENTION_DAYS must be a positive integer");
  await mongoose.connect(config.mongoUri);
  const filter = {
    status: "removed",
    removedAt: { $lte: new Date(Date.now() - days * 86400000) },
    "images.0": { $exists: true },
  };
  const candidates = await Offer.find(filter).limit(100);
  const applying = process.argv.includes("--apply");
  if (!applying) {
    console.log(
      JSON.stringify({
        mode: "dry-run",
        eligibleListings: candidates.length,
        queuedAssets: await AssetCleanup.countDocuments(),
        batchLimit: 100,
        retentionDays: days,
      }),
    );
    return;
  }
  let purged = 0;
  for (const listing of candidates) {
    // Queue before detaching images: a crash leaves referenced assets protected by drain().
    await cleanup.schedule(listing.images);
    const result = await Offer.updateOne(
      { _id: listing._id, __v: listing.__v, status: "removed" },
      { $set: { images: [] }, $inc: { __v: 1 } },
    );
    if (result.modifiedCount) purged++;
  }
  console.log(
    JSON.stringify({
      mode: "apply",
      purgedListings: purged,
      deletedAssets: await cleanup.drain(),
      remainingQueue: await AssetCleanup.countDocuments(),
    }),
  );
}
run()
  .catch(() => {
    console.error("Media maintenance failed; check configuration and services");
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
