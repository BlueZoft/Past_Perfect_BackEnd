const router = require("express").Router();
const User = require("../models/User");
const auth = require("../middleware/isAuthenticated");
const upload = require("../lib/upload");
const images = require("../services/images");
const cleanup = require("../services/mediaCleanup");
const management = require("../services/listings");
const { asyncRoute, fail } = require("../lib/http");
function version(body) {
  management.assertFields(body, ["version"]);
  if (typeof body.version !== "string" || !/^\d+$/.test(body.version))
    throw fail(400, "A valid version is required");
  return management.version(Number(body.version));
}
router.put(
  "/offer/:id/images",
  auth,
  upload("images", 3),
  asyncRoute(async (req, res) => {
    const expected = version(req.body),
      listing = await management.owned(req.params.id, req.user._id);
    if (
      !["active", "reserved"].includes(listing.status) ||
      listing.moderationHidden
    )
      throw fail(409, "This listing cannot be edited");
    if (!req.files?.length) throw fail(400, "At least one image is required");
    for (const file of req.files) await images.validate(file);
    const saved = [];
    let updated;
    try {
      for (const file of req.files) saved.push(await images.save(file));
      await cleanup.schedule(listing.images);
      updated = await management.update(listing, expected, { images: saved });
    } catch (err) {
      await cleanup.cleanup(saved);
      throw err;
    }
    await cleanup.cleanup(listing.images);
    res.json(updated);
  }),
);
router.put(
  "/user/avatar",
  auth,
  upload("avatar", 1),
  asyncRoute(async (req, res) => {
    const expected = version(req.body);
    if (req.files?.length !== 1)
      throw fail(400, "One avatar image is required");
    const saved = await images.save(req.files[0], { avatar: true });
    let user;
    try {
      await cleanup.schedule(
        req.user.account.avatar ? [req.user.account.avatar] : [],
      );
      const filter = { _id: req.user._id, avatarVersion: expected };
      if (expected === 0) {
        delete filter.avatarVersion;
        filter.$or = [
          { avatarVersion: 0 },
          { avatarVersion: { $exists: false } },
        ];
      }
      user = await User.findOneAndUpdate(
        filter,
        { $set: { "account.avatar": saved }, $inc: { avatarVersion: 1 } },
        { new: true },
      );
      if (!user) throw fail(409, "Avatar changed. Reload your profile.");
    } catch (err) {
      await cleanup.cleanup([saved]);
      throw err;
    }
    await cleanup.cleanup(
      req.user.account.avatar ? [req.user.account.avatar] : [],
    );
    res.json(require("../services/publicUser")(user));
  }),
);
router.delete(
  "/user/avatar",
  auth,
  asyncRoute(async (req, res) => {
    management.assertFields(req.body, ["version"]);
    const expected = management.version(req.body.version);
    const filter = { _id: req.user._id, avatarVersion: expected };
    if (expected === 0) {
      delete filter.avatarVersion;
      filter.$or = [
        { avatarVersion: 0 },
        { avatarVersion: { $exists: false } },
      ];
    }
    await cleanup.schedule(
      req.user.account.avatar ? [req.user.account.avatar] : [],
    );
    const user = await User.findOneAndUpdate(
      filter,
      { $unset: { "account.avatar": "" }, $inc: { avatarVersion: 1 } },
      { new: true },
    );
    if (!user) throw fail(409, "Avatar changed. Reload your profile.");
    await cleanup.cleanup(
      req.user.account.avatar ? [req.user.account.avatar] : [],
    );
    res.json(require("../services/publicUser")(user));
  }),
);
module.exports = router;
