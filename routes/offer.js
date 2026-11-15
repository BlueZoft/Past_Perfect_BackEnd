const router = require("express").Router();
const multer = require("multer");
const Offer = require("../models/Offer");
const auth = require("../middleware/isAuthenticated");
const images = require("../services/images");
const { asyncRoute, fail } = require("../lib/http");
const { validateListing, listQuery } = require("../lib/listings");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 3, fields: 9, fieldSize: 16000 },
}).fields([
  { name: "picture1", maxCount: 1 },
  { name: "picture2", maxCount: 1 },
  { name: "picture3", maxCount: 1 },
]);
router.post(
  "/offer/publish",
  auth,
  (req, res, next) =>
    upload(req, res, (err) => {
      if (err)
        return next(fail(400, "Upload rejected: at most 3 images, 5 MB each"));
      next();
    }),
  asyncRoute(async (req, res) => {
    const listing = validateListing(req.body);
    const files = ["picture1", "picture2", "picture3"].flatMap(
      (key) => req.files?.[key] || [],
    );
    if (!files.length) throw fail(400, "At least one image is required");
    for (const file of files) await images.validate(file);
    const saved = [];
    try {
      for (const file of files) saved.push(await images.save(file));
      const offer = await Offer.create({
        ...listing,
        images: saved,
        owner: req.user._id,
      });
      await offer.populate("owner", "account.username account.avatar");
      res.status(201).json(offer);
    } catch (err) {
      await Promise.allSettled(saved.map((image) => images.remove(image)));
      throw err;
    }
  }),
);
router.get(
  "/offers",
  asyncRoute(async (req, res) => {
    const { filter, sort, page, limit } = listQuery(req.query);
    const [offers, count] = await Promise.all([
      Offer.find(filter)
        .populate("owner", "account.username account.avatar")
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit),
      Offer.countDocuments(filter),
    ]);
    res.json({ count, page, limit, offers });
  }),
);
router.get(
  "/offer/:id",
  asyncRoute(async (req, res) => {
    if (!/^[a-fA-F0-9]{24}$/.test(req.params.id))
      throw fail(400, "Invalid listing ID");
    const offer = await Offer.findOne({
      _id: req.params.id,
      status: { $ne: "removed" },
      moderationHidden: { $ne: true },
    }).populate("owner", "account.username account.avatar");
    if (!offer) throw fail(404, "Listing not found");
    res.json(offer);
  }),
);
// Owner-scoped routes never accept an owner ID from the browser.
const management = require("../services/listings");
router.get(
  "/user/offers",
  auth,
  asyncRoute(async (req, res) => {
    const { filter, sort, page, limit } = listQuery(req.query);
    filter.owner = req.user._id;
    delete filter.moderationHidden;
    filter.status = { $ne: "removed" };
    if (req.query.status) {
      if (!["active", "reserved", "sold"].includes(req.query.status))
        throw fail(400, "Invalid listing status");
      filter.status = req.query.status;
    }
    const [offers, count] = await Promise.all([
      Offer.find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit),
      Offer.countDocuments(filter),
    ]);
    res.json({ offers, count, page, limit });
  }),
);
router.patch(
  "/offer/:id",
  auth,
  asyncRoute(async (req, res) => {
    management.assertFields(req.body, [
      "title",
      "description",
      "price",
      "condition",
      "size",
      "version",
      "category",
      "district",
      "town",
    ]);
    const version = management.version(req.body.version);
    const listing = await management.owned(req.params.id, req.user._id);
    if (
      listing.moderationHidden ||
      !["active", "reserved"].includes(listing.status)
    )
      throw fail(409, "This listing is sold or hidden and cannot be edited");
    const fields = validateListing(req.body);
    res.json(await management.update(listing, version, fields));
  }),
);
router.patch(
  "/offer/:id/status",
  auth,
  asyncRoute(async (req, res) => {
    management.assertFields(req.body, ["status", "version"]);
    const version = management.version(req.body.version);
    const listing = await management.owned(req.params.id, req.user._id);
    if (
      listing.moderationHidden ||
      !management.transitions[listing.status]?.includes(req.body.status) ||
      req.body.status === "removed"
    )
      throw fail(409, "Invalid listing status transition");
    res.json(
      await management.update(listing, version, { status: req.body.status }),
    );
  }),
);
router.delete(
  "/offer/:id",
  auth,
  asyncRoute(async (req, res) => {
    management.assertFields(req.body, ["version"]);
    const version = management.version(req.body.version);
    const listing = await management.owned(req.params.id, req.user._id);
    await management.update(listing, version, {
      status: "removed",
      removedAt: new Date(),
    });
    res.status(204).end();
  }),
);
router.get(
  "/user/offers/:id",
  auth,
  asyncRoute(async (req, res) => {
    const listing = await management.owned(req.params.id, req.user._id);
    await listing.populate("owner", "account.username account.avatar");
    res.json(listing);
  }),
);
module.exports = router;
