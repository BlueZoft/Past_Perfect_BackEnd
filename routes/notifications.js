const router = require("express").Router();
const Notification = require("../models/Notification");
const auth = require("../middleware/isAuthenticated");
const { asyncRoute, fail } = require("../lib/http");
const { validateId } = require("../services/listings");
const { listQuery } = require("../lib/listings");
router.get(
  "/user/notifications",
  auth,
  asyncRoute(async (req, res) => {
    const { page, limit } = listQuery(req.query);
    const filter = { user: req.user._id };
    const [notifications, count, unreadCount] = await Promise.all([
      Notification.find(filter)
        .select("type link readAt createdAt")
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Notification.countDocuments(filter),
      Notification.countDocuments({ ...filter, readAt: { $exists: false } }),
    ]);
    res.json({ notifications, count, unreadCount, page, limit });
  }),
);
router.patch(
  "/user/notifications/:id/read",
  auth,
  asyncRoute(async (req, res) => {
    validateId(req.params.id);
    const result = await Notification.updateOne(
      { _id: req.params.id, user: req.user._id },
      { $set: { readAt: new Date() } },
    );
    if (!result.matchedCount) throw fail(404, "Notification not found");
    res.status(204).end();
  }),
);
router.post(
  "/user/notifications/read-all",
  auth,
  asyncRoute(async (req, res) => {
    await Notification.updateMany(
      {
        user: req.user._id,
        createdAt: { $lte: new Date() },
        readAt: { $exists: false },
      },
      { $set: { readAt: new Date() } },
    );
    res.status(204).end();
  }),
);
module.exports = router;
