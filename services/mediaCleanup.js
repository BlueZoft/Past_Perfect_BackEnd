const AssetCleanup = require("../models/AssetCleanup");
const Offer = require("../models/Offer");
const User = require("../models/User");
const images = require("./images");
exports.schedule = async (assets) => {
  for (const image of assets || []) {
    if (!image?.publicId) continue;
    const driver =
      image.driver ||
      (image.url?.startsWith("/uploads/") ? "local" : "cloudinary");
    await AssetCleanup.updateOne(
      { publicId: image.publicId, driver },
      { $setOnInsert: { publicId: image.publicId, driver } },
      { upsert: true },
    );
  }
};
exports.drain = async () => {
  const jobs = await AssetCleanup.find()
    .sort({ updatedAt: 1, _id: 1 })
    .limit(100);
  let deleted = 0;
  for (const job of jobs) {
    if (
      (await Offer.exists({ "images.publicId": job.publicId })) ||
      (await User.exists({ "account.avatar.publicId": job.publicId }))
    ) {
      await AssetCleanup.updateOne(
        { _id: job._id },
        { $set: { updatedAt: new Date() } },
      );
      continue;
    }
    try {
      await images.remove({ publicId: job.publicId, driver: job.driver });
      await job.deleteOne();
      deleted++;
    } catch {
      await AssetCleanup.updateOne({ _id: job._id }, { $inc: { attempts: 1 } });
    }
  }
  return deleted;
};
// Cleanup failures must not turn a committed media update into an apparent failed update.
exports.cleanup = async (assets) => {
  try {
    await exports.schedule(assets);
    await exports.drain();
  } catch {
    console.error("Media cleanup pending: run the media maintenance command");
  }
};
