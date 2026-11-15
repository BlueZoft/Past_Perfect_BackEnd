const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const User = require("../models/User");
const Offer = require("../models/Offer");
const auth = require("../middleware/isAuthenticated");
const { requireAdmin } = require("../services/admin");
const { validateId, version, assertFields } = require("../services/listings");
const { listQuery } = require("../lib/listings");
const { asyncRoute, fail } = require("../lib/http");
const safe = (user) => ({
  _id: user._id,
  account: { username: user.account.username },
  suspended: !!user.suspended,
  suspensionReason: user.suspensionReason || "",
  moderationVersion: user.moderationVersion || 0,
  accountModerationAudit: user.accountModerationAudit,
});
router.get("/policy", (req, res) => res.json(require("../lib/policy").policy));
router.get(
  "/admin/users/:id",
  auth,
  requireAdmin,
  asyncRoute(async (req, res) => {
    validateId(req.params.id);
    const user = await User.findById(req.params.id).select(
      "+accountModerationAudit",
    );
    if (!user) throw fail(404, "User not found");
    res.json(safe(user));
  }),
);
router.patch(
  "/admin/users/:id/moderation",
  auth,
  requireAdmin,
  asyncRoute(async (req, res) => {
    validateId(req.params.id);
    assertFields(req.body, ["suspended", "reason", "version"]);
    version(req.body.version);
    if (
      typeof req.body.suspended !== "boolean" ||
      typeof req.body.reason !== "string" ||
      !req.body.reason.trim() ||
      req.body.reason.length > 1000
    )
      throw fail(400, "A decision and public reason are required");
    const user = await require("../services/accountModeration").change(
      req.params.id,
      req.body.version,
      req.body.suspended,
      req.body.reason.trim(),
      req.user._id,
    );
    res.json(safe(user));
  }),
);
router.get(
  "/user/appeals",
  auth,
  asyncRoute(async (req, res) => {
    const { page, limit } = listQuery(req.query);
    const user = await User.findById(req.user._id).select("+appeals");
    const appeals = user.appeals || [];
    res.json({
      appeals: [...appeals].reverse().slice((page - 1) * limit, page * limit),
      count: appeals.length,
      page,
      limit,
    });
  }),
);
router.post(
  "/user/appeals",
  auth,
  rateLimit({
    windowMs: 3600000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many attempts; try later" },
  }),
  asyncRoute(async (req, res) => {
    assertFields(req.body, ["text", "version"]);
    const expected = version(req.body.version);
    if (
      typeof req.body.text !== "string" ||
      req.body.text.trim().length < 10 ||
      req.body.text.trim().length > 2000
    )
      throw fail(400, "Appeal must be 10–2000 characters");
    const user = await User.findOneAndUpdate(
      {
        _id: req.user._id,
        suspended: true,
        moderationVersion: expected,
        "appeals.moderationVersion": { $ne: expected },
        "appeals.99": { $exists: false },
      },
      {
        $push: {
          appeals: {
            moderationVersion: expected,
            text: req.body.text.trim(),
            status: "open",
            createdAt: new Date(),
          },
        },
      },
      { new: true, runValidators: true },
    ).select("+appeals");
    if (user)
      return res
        .status(201)
        .json(
          user.appeals.find((appeal) => appeal.moderationVersion === expected),
        );
    const current = await User.findById(req.user._id).select("+appeals");
    const existing = current.appeals?.find(
      (appeal) => appeal.moderationVersion === expected,
    );
    if (current.suspended && current.moderationVersion === expected && existing)
      return res.status(200).json(existing);
    throw fail(
      409,
      "Account changed or appeal limit reached. Reload account status.",
    );
  }),
);
router.get(
  "/admin/appeals",
  auth,
  requireAdmin,
  asyncRoute(async (req, res) => {
    const { page, limit } = listQuery(req.query);
    const status = req.query.status || "open";
    if (!["open", "accepted", "rejected"].includes(status))
      throw fail(400, "Invalid appeal status");
    const [result] = await User.aggregate([
      { $unwind: "$appeals" },
      { $match: { "appeals.status": status } },
      { $sort: { "appeals.createdAt": 1, _id: 1 } },
      {
        $project: {
          appeal: "$appeals",
          user: {
            _id: "$_id",
            username: "$account.username",
            suspended: "$suspended",
            moderationVersion: "$moderationVersion",
          },
        },
      },
      {
        $facet: {
          items: [{ $skip: (page - 1) * limit }, { $limit: limit }],
          total: [{ $count: "count" }],
        },
      },
    ]);
    res.json({
      appeals: result.items,
      count: result.total[0]?.count || 0,
      page,
      limit,
    });
  }),
);
router.patch(
  "/admin/appeals/:id",
  auth,
  requireAdmin,
  asyncRoute(async (req, res) => {
    validateId(req.params.id);
    assertFields(req.body, ["decision", "resolution", "version"]);
    const expected = version(req.body.version);
    if (
      !["accepted", "rejected"].includes(req.body.decision) ||
      typeof req.body.resolution !== "string" ||
      !req.body.resolution.trim() ||
      req.body.resolution.length > 1000
    )
      throw fail(400, "An appeal decision and public resolution are required");
    const user = await User.findOne({
      appeals: {
        $elemMatch: {
          _id: req.params.id,
          status: "open",
          moderationVersion: expected,
        },
      },
    }).select("+appeals");
    if (!user) throw fail(409, "Appeal changed or already reviewed");
    if (req.body.decision === "accepted")
      await require("../services/accountModeration").change(
        user._id,
        expected,
        false,
        req.body.resolution.trim(),
        req.user._id,
        req.params.id,
      );
    else {
      const result = await User.updateOne(
        {
          _id: user._id,
          suspended: true,
          moderationVersion: expected,
          appeals: { $elemMatch: { _id: req.params.id, status: "open" } },
        },
        {
          $set: {
            "appeals.$.status": "rejected",
            "appeals.$.resolution": req.body.resolution.trim(),
            "appeals.$.reviewedAt": new Date(),
          },
          $push: {
            accountModerationAudit: {
              $each: [
                {
                  actor: req.user._id,
                  action: "appeal-rejected",
                  reason: req.body.resolution.trim(),
                  at: new Date(),
                },
              ],
              $slice: -100,
            },
          },
        },
      );
      if (!result.modifiedCount)
        throw fail(409, "Account changed. Reload before trying again.");
      await require("../services/notifications").notify(
        user._id,
        "account",
        "/account-status",
        "appeal:" + req.params.id + ":rejected",
      );
    }
    res.status(204).end();
  }),
);
router.get(
  "/admin/policy-listings",
  auth,
  requireAdmin,
  asyncRoute(async (req, res) => {
    const { page, limit } = listQuery(req.query);
    const filter = { policyReview: true, status: { $ne: "removed" } };
    const [offers, count] = await Promise.all([
      Offer.find(filter)
        .sort({ createdAt: 1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Offer.countDocuments(filter),
    ]);
    res.json({ offers, count, page, limit });
  }),
);
module.exports = router;
