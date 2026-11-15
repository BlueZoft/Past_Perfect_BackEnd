const fs = require("fs/promises");
const path = require("path");
const images = require("./images");
const Offer = require("../models/Offer");
const User = require("../models/User");
const cleanup = require("./mediaCleanup");
exports.scan = async ({ apply = false, graceHours = 24, after = "" } = {}) => {
  if (images.driver !== "local")
    throw new Error("Local orphan scanning requires the local image driver");
  if (!Number.isSafeInteger(graceHours) || graceHours < 1)
    throw new Error("Orphan grace must be a positive number of hours");
  const directory = await fs.opendir(images.directory).catch((err) => {
    if (err.code === "ENOENT") return null;
    throw err;
  });
  const names = [];
  let more = false;
  if (directory)
    for await (const entry of directory) {
      const name = entry.name;
      if (
        !entry.isFile() ||
        name <= after ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(webp|png|jpg)$/.test(
          name,
        )
      )
        continue;
      if (names.length === 1000) {
        more = true;
        if (name >= names.at(-1)) continue;
      }
      let low = 0,
        high = names.length;
      while (low < high) {
        const mid = (low + high) >> 1;
        if (names[mid] < name) low = mid + 1;
        else high = mid;
      }
      names.splice(low, 0, name);
      if (names.length > 1000) names.pop();
    }
  let eligible = 0,
    queued = 0;
  for (const publicId of names) {
    const stat = await fs
      .lstat(path.join(images.directory, publicId))
      .catch((err) => {
        if (err.code === "ENOENT") return null;
        throw err;
      });
    if (!stat?.isFile() || stat.mtimeMs > Date.now() - graceHours * 3600000)
      continue;
    if (
      (await Offer.exists({ "images.publicId": publicId })) ||
      (await User.exists({ "account.avatar.publicId": publicId }))
    )
      continue;
    eligible++;
    if (apply) {
      await cleanup.schedule([{ publicId, driver: "local" }]);
      queued++;
    }
  }
  return {
    mode: apply ? "apply" : "dry-run",
    scanned: names.length,
    eligible,
    queued,
    nextCursor: more ? names.at(-1) : null,
    deletedAssets: apply ? await cleanup.drain() : 0,
  };
};
