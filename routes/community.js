const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const User = require("../models/User");
const Offer = require("../models/Offer");
const Favourite = require("../models/Favourite");
const Enquiry = require("../models/Enquiry");
const Message = require("../models/Message");
const auth = require("../middleware/isAuthenticated");
const { asyncRoute, fail } = require("../lib/http");
const { catalogue } = require("../lib/catalogue");
const { listQuery } = require("../lib/listings");
const { validateId, assertFields } = require("../services/listings");
const publicSeller =
  "account.username account.avatar account.bio createdAt emailVerifiedAt";
const messagesLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many messages; please try later" },
});
router.get("/catalogue", (req, res) => res.json(catalogue));
router.get(
  "/seller/:id",
  asyncRoute(async (req, res) => {
    validateId(req.params.id);
    const seller = await User.findOne({
      _id: req.params.id,
      suspended: { $ne: true },
    })
      .select(publicSeller)
      .lean();
    if (!seller) throw fail(404, "Seller not found");
    seller.emailVerified = !!seller.emailVerifiedAt;
    delete seller.emailVerifiedAt;
    const { filter, sort, page, limit } = listQuery(req.query);
    filter.owner = seller._id;
    const data = await require("../services/publicListings").page(
      filter,
      sort,
      page,
      limit,
    );
    res.json({ seller, ...data });
  }),
);
router.patch(
  "/user/profile",
  auth,
  asyncRoute(async (req, res) => {
    assertFields(req.body, ["username", "bio"]);
    const username =
      typeof req.body.username === "string" ? req.body.username.trim() : "";
    const bio = typeof req.body.bio === "string" ? req.body.bio.trim() : "";
    if (
      !username ||
      username.length > 80 ||
      typeof req.body.bio !== "string" ||
      bio.length > 1000
    )
      throw fail(400, "Username must be 1–80 and bio at most 1000 characters");
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { "account.username": username, "account.bio": bio } },
      { new: true, runValidators: true },
    );
    res.json(require("../services/publicUser")(user));
  }),
);
router.get(
  "/user/favourites",
  auth,
  asyncRoute(async (req, res) => {
    const { page, limit } = listQuery(req.query);
    const [result] = await Favourite.aggregate([
      { $match: { user: req.user._id } },
      { $sort: { createdAt: -1, _id: -1 } },
      {
        $lookup: {
          from: Offer.collection.name,
          localField: "listing",
          foreignField: "_id",
          as: "offer",
        },
      },
      { $unwind: "$offer" },
      {
        $lookup: {
          from: User.collection.name,
          let: { owner: "$offer.owner" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$_id", "$$owner"] },
                suspended: { $ne: true },
              },
            },
            { $project: { _id: 1 } },
          ],
          as: "visibleSeller",
        },
      },
      { $match: { "visibleSeller.0": { $exists: true } } },
      { $unset: "visibleSeller" },
      { $project: { "offer.moderationAudit": 0 } },
      {
        $match: {
          "offer.status": { $ne: "removed" },
          "offer.moderationHidden": { $ne: true },
        },
      },
      {
        $facet: {
          items: [{ $skip: (page - 1) * limit }, { $limit: limit }],
          total: [{ $count: "count" }],
        },
      },
    ]);
    const offers = result.items.map((item) => item.offer);
    await Offer.populate(offers, {
      path: "owner",
      select: "account.username account.avatar",
    });
    res.json({ offers, count: result.total[0]?.count || 0, page, limit });
  }),
);
router.get(
  "/user/favourites/:id",
  auth,
  asyncRoute(async (req, res) => {
    validateId(req.params.id);
    res.json({
      saved: !!(await Favourite.exists({
        user: req.user._id,
        listing: req.params.id,
      })),
    });
  }),
);
router.put(
  "/user/favourites/:id",
  auth,
  asyncRoute(async (req, res) => {
    validateId(req.params.id);
    const listing = await Offer.findOne({
      _id: req.params.id,
      status: { $ne: "removed" },
      moderationHidden: { $ne: true },
    });
    if (
      !listing ||
      !(await User.exists({ _id: listing.owner, suspended: { $ne: true } }))
    )
      throw fail(404, "Listing not found");
    try {
      await Favourite.updateOne(
        { user: req.user._id, listing: listing._id },
        { $setOnInsert: { user: req.user._id, listing: listing._id } },
        { upsert: true },
      );
    } catch (err) {
      if (err.code !== 11000) throw err;
    }
    res.status(204).end();
  }),
);
router.delete(
  "/user/favourites/:id",
  auth,
  asyncRoute(async (req, res) => {
    validateId(req.params.id);
    await Favourite.deleteOne({ user: req.user._id, listing: req.params.id });
    res.status(204).end();
  }),
);
function text(body) {
  assertFields(body, ["message"]);
  if (
    typeof body.message !== "string" ||
    !body.message.trim() ||
    body.message.trim().length > 2000
  )
    throw fail(400, "Message must be 1–2000 characters");
  return body.message.trim();
}
async function participant(id, user) {
  validateId(id);
  const enquiry = await Enquiry.findOne({
    _id: id,
    $or: [{ buyer: user }, { seller: user }],
  });
  if (!enquiry) throw fail(404, "Enquiry not found");
  return enquiry;
}
async function send(enquiry, user, value) {
  const recipient =
    String(user) === String(enquiry.buyer) ? enquiry.seller : enquiry.buyer;
  if (!(await User.exists({ _id: recipient, suspended: { $ne: true } })))
    throw fail(403, "Messaging is unavailable for this account");
  const message = await Message.create({
    enquiry: enquiry._id,
    sender: user,
    text: value,
  });
  await Enquiry.updateOne(
    { _id: enquiry._id },
    { $max: { lastMessageAt: message.createdAt } },
  );

  await require("../services/notifications").notify(
    recipient,
    "message",
    "/enquiries/" + enquiry._id,
    "message:" + message._id,
  );
  return message;
}
router.post(
  "/offer/:id/enquiries",
  auth,
  messagesLimit,
  asyncRoute(async (req, res) => {
    const value = text(req.body);
    validateId(req.params.id);
    const listing = await Offer.findOne({
      _id: req.params.id,
      status: "active",
      moderationHidden: { $ne: true },
    });
    if (!listing) throw fail(404, "Active listing not found");
    if (String(listing.owner) === String(req.user._id))
      throw fail(400, "You cannot enquire about your own listing");
    const owner = await User.exists({
      _id: listing.owner,
      suspended: { $ne: true },
    });
    if (!owner) throw fail(404, "Seller unavailable");
    await require("../services/blocks").assertMessaging(
      req.user._id,
      listing.owner,
    );
    let enquiry;
    try {
      enquiry = await Enquiry.findOneAndUpdate(
        { buyer: req.user._id, listing: listing._id },
        {
          $setOnInsert: {
            buyer: req.user._id,
            seller: listing.owner,
            listing: listing._id,
            title: listing.title,
          },
        },
        { upsert: true, new: true, runValidators: true },
      );
    } catch (err) {
      if (err.code !== 11000) throw err;
      enquiry = await Enquiry.findOne({
        buyer: req.user._id,
        listing: listing._id,
      });
    }
    await send(enquiry, req.user._id, value);
    res.status(201).json({ _id: enquiry._id });
  }),
);
router.get(
  "/user/enquiries",
  auth,
  asyncRoute(async (req, res) => {
    const { page, limit } = listQuery(req.query);
    const filter = { $or: [{ buyer: req.user._id }, { seller: req.user._id }] };
    const [enquiries, count] = await Promise.all([
      Enquiry.find(filter)
        .select("-__v")
        .populate("buyer seller", "account.username")
        .sort({ lastMessageAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Enquiry.countDocuments(filter),
    ]);
    res.json({ enquiries, count, page, limit });
  }),
);
router.get(
  "/enquiry/:id/messages",
  auth,
  asyncRoute(async (req, res) => {
    const enquiry = await participant(req.params.id, req.user._id);
    await enquiry.populate("buyer seller", "account.username");
    const { page, limit } = listQuery(req.query);
    const [messages, count] = await Promise.all([
      Message.find({ enquiry: enquiry._id })
        .select("sender text createdAt")
        .sort({ createdAt: 1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Message.countDocuments({ enquiry: enquiry._id }),
    ]);
    res.json({ enquiry, messages, count, page, limit });
  }),
);
router.post(
  "/enquiry/:id/messages",
  auth,
  messagesLimit,
  asyncRoute(async (req, res) => {
    const value = text(req.body);
    const enquiry = await participant(req.params.id, req.user._id);
    await require("../services/blocks").assertMessaging(
      enquiry.buyer,
      enquiry.seller,
    );
    res.status(201).json(await send(enquiry, req.user._id, value));
  }),
);
module.exports = router;
