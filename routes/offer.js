const router = require("express").Router();
const multer = require("multer");
const Offer = require("../models/Offer");
const auth = require("../middleware/isAuthenticated");
const images = require("../services/images");
const { asyncRoute, fail } = require("../lib/http");
const { validateListing, listQuery } = require("../lib/listings");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 3, fields: 6, fieldSize: 16000 },
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
    }).populate("owner", "account.username account.avatar");
    if (!offer) throw fail(404, "Listing not found");
    res.json(offer);
  }),
);
module.exports = router;
