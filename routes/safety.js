const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const User = require("../models/User");
const Offer = require("../models/Offer");
const Message = require("../models/Message");
const Enquiry = require("../models/Enquiry");
const Block = require("../models/Block");
const Report = require("../models/Report");
const auth = require("../middleware/isAuthenticated");
const { requireAdmin } = require("../services/admin");
const { asyncRoute, fail } = require("../lib/http");
const { validateId, assertFields, version } = require("../services/listings");
const { listQuery } = require("../lib/listings");
const reportLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many reports; please try later" },
});
router.get(
  "/user/blocks",
  auth,
  asyncRoute(async (req, res) => {
    const { page, limit } = listQuery(req.query);
    const [blocks, count] = await Promise.all([
      Block.find({ user: req.user._id })
        .populate("blocked", "account.username")
        .sort({ _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Block.countDocuments({ user: req.user._id }),
    ]);
    res.json({ blocks, count, page, limit });
  }),
);
router.get(
  "/user/blocks/:id",
  auth,
  asyncRoute(async (req, res) => {
    validateId(req.params.id);
    res.json({
      blocked: !!(await Block.exists({
        user: req.user._id,
        blocked: req.params.id,
      })),
    });
  }),
);
router.put(
  "/user/blocks/:id",
  auth,
  asyncRoute(async (req, res) => {
    validateId(req.params.id);
    if (String(req.user._id) === req.params.id.toLowerCase())
      throw fail(400, "You cannot block yourself");
    if (!(await User.exists({ _id: req.params.id })))
      throw fail(404, "User not found");
    try {
      await Block.updateOne(
        { user: req.user._id, blocked: req.params.id },
        { $setOnInsert: { user: req.user._id, blocked: req.params.id } },
        { upsert: true },
      );
    } catch (err) {
      if (err.code !== 11000) throw err;
    }
    res.status(204).end();
  }),
);
router.delete(
  "/user/blocks/:id",
  auth,
  asyncRoute(async (req, res) => {
    validateId(req.params.id);
    await Block.deleteOne({ user: req.user._id, blocked: req.params.id });
    res.status(204).end();
  }),
);
router.post(
  "/reports",
  auth,
  reportLimit,
  asyncRoute(async (req, res) => {
    assertFields(req.body, ["targetType", "target", "reason", "details"]);
    const { targetType, target, reason } = req.body;
    validateId(target);
    if (
      !["scam", "prohibited-item", "harassment", "spam", "other"].includes(
        reason,
      ) ||
      typeof req.body.details !== "string" ||
      req.body.details.trim().length > 2000
    )
      throw fail(
        400,
        "Choose a report reason and details up to 2000 characters",
      );
    let snapshot;
    if (targetType === "listing") {
      const listing = await Offer.findOne({
        _id: target,
        status: { $ne: "removed" },
        moderationHidden: { $ne: true },
      });
      if (!listing) throw fail(404, "Listing not found");
      if (String(listing.owner) === String(req.user._id))
        throw fail(400, "You cannot report your own listing");
      snapshot = listing.title + "\n" + listing.description;
    } else if (targetType === "user") {
      const user = await User.findById(target);
      if (!user) throw fail(404, "User not found");
      if (String(user._id) === String(req.user._id))
        throw fail(400, "You cannot report yourself");
      snapshot = user.account.username + "\n" + (user.account.bio || "");
    } else if (targetType === "message") {
      const message = await Message.findById(target);
      if (!message) throw fail(404, "Message not found");
      if (
        !(await Enquiry.exists({
          _id: message.enquiry,
          $or: [{ buyer: req.user._id }, { seller: req.user._id }],
        }))
      )
        throw fail(404, "Message not found");
      if (String(message.sender) === String(req.user._id))
        throw fail(400, "You cannot report your own message");
      snapshot = message.text;
    } else throw fail(400, "Invalid report target");
    let report;
    try {
      report = await Report.findOneAndUpdate(
        { reporter: req.user._id, targetType, target },
        {
          $setOnInsert: {
            reporter: req.user._id,
            targetType,
            target,
            reason,
            details: req.body.details.trim(),
            snapshot,
          },
        },
        { new: true, upsert: true, runValidators: true },
      );
    } catch (err) {
      if (err.code !== 11000) throw err;
      report = await Report.findOne({
        reporter: req.user._id,
        targetType,
        target,
      });
    }
    res.status(201).json({ _id: report._id, status: report.status });
  }),
);
router.get(
  "/admin/reports",
  auth,
  requireAdmin,
  asyncRoute(async (req, res) => {
    const { page, limit } = listQuery(req.query);
    const status = req.query.status || "open";
    if (!["open", "resolved", "dismissed"].includes(status))
      throw fail(400, "Invalid report status");
    const [reports, count] = await Promise.all([
      Report.find({ status })
        .populate("reporter reviewer", "account.username")
        .sort({ createdAt: 1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Report.countDocuments({ status }),
    ]);
    res.json({ reports, count, page, limit });
  }),
);
router.patch(
  "/admin/reports/:id",
  auth,
  requireAdmin,
  asyncRoute(async (req, res) => {
    validateId(req.params.id);
    assertFields(req.body, ["status", "resolution", "version"]);
    const expected = version(req.body.version);
    if (
      !["resolved", "dismissed"].includes(req.body.status) ||
      typeof req.body.resolution !== "string" ||
      !req.body.resolution.trim() ||
      req.body.resolution.length > 2000
    )
      throw fail(400, "A decision and resolution note are required");
    const report = await Report.findOneAndUpdate(
      { _id: req.params.id, __v: expected, status: "open" },
      {
        $set: {
          status: req.body.status,
          resolution: req.body.resolution.trim(),
          reviewer: req.user._id,
          reviewedAt: new Date(),
        },
        $inc: { __v: 1 },
      },
      { new: true, runValidators: true },
    );
    if (!report) throw fail(409, "Report changed or already reviewed");
    await require("../services/notifications").notify(
      report.reporter,
      "report",
      "/reports",
      "report:" + report._id + ":" + report.__v,
    );
    res.json(report);
  }),
);
router.get(
  "/admin/offers/:id",
  auth,
  requireAdmin,
  asyncRoute(async (req, res) => {
    validateId(req.params.id);
    const listing = await Offer.findById(req.params.id).select(
      "+moderationAudit",
    );
    if (!listing) throw fail(404, "Listing not found");
    res.json(listing);
  }),
);
router.patch(
  "/admin/offers/:id/moderation",
  auth,
  requireAdmin,
  asyncRoute(async (req, res) => {
    validateId(req.params.id);
    assertFields(req.body, ["hidden", "reason", "version"]);
    const expected = version(req.body.version);
    if (
      typeof req.body.hidden !== "boolean" ||
      typeof req.body.reason !== "string" ||
      !req.body.reason.trim() ||
      req.body.reason.length > 1000
    )
      throw fail(400, "A visibility decision and reason are required");
    const listing = await Offer.findOneAndUpdate(
      { _id: req.params.id, __v: expected, status: { $ne: "removed" } },
      {
        $set: { moderationHidden: req.body.hidden },
        $inc: { __v: 1 },
        $push: {
          moderationAudit: {
            $each: [
              {
                actor: req.user._id,
                hidden: req.body.hidden,
                reason: req.body.reason.trim(),
                at: new Date(),
              },
            ],
            $slice: -100,
          },
        },
      },
      { new: true, runValidators: true },
    ).select("+moderationAudit");
    if (!listing) throw fail(409, "Listing changed or was removed");
    await require("../services/notifications").notify(
      listing.owner,
      "moderation",
      "/my-listings",
      "moderation:" + listing._id + ":" + listing.__v,
    );
    res.json(listing);
  }),
);
router.get(
  "/user/reports",
  auth,
  asyncRoute(async (req, res) => {
    const { page, limit } = listQuery(req.query);
    const filter = { reporter: req.user._id };
    const [reports, count] = await Promise.all([
      Report.find(filter)
        .select("targetType reason status reviewedAt createdAt")
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Report.countDocuments(filter),
    ]);
    res.json({ reports, count, page, limit });
  }),
);
module.exports = router;
