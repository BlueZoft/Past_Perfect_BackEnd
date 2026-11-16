const router = require("express").Router();
const auth = require("../middleware/isAuthenticated");
const rateLimit = require("express-rate-limit");
const { asyncRoute } = require("../lib/http");
const { assertFields } = require("../services/listings");
const orders = require("../services/orders");
const { listQuery } = require("../lib/listings");
router.get("/orders/config", (req, res) =>
  res.json(require("../services/orderConfig").current()),
);
router.get(
  "/offer/:id/quote",
  auth,
  asyncRoute(async (req, res) =>
    res.json(await orders.quote(req.params.id, req.user)),
  ),
);
router.post(
  "/orders",
  auth,
  rateLimit({
    windowMs: 900000,
    max: 5,
    keyGenerator: (req) => String(req.user._id),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many order attempts; try later" },
  }),
  asyncRoute(async (req, res) => {
    assertFields(req.body, [
      "listingId",
      "listingVersion",
      "expectedTotalMinor",
      "idempotencyKey",
    ]);
    const result = await orders.create(req.body, req.user);
    res.status(result.replayed ? 200 : 201).json(result.order);
  }),
);
router.get(
  "/user/orders",
  auth,
  asyncRoute(async (req, res) => {
    const { page, limit } = listQuery(req.query);
    res.json(await orders.page(req.user._id, page, limit));
  }),
);
router.get(
  "/orders/:id",
  auth,
  asyncRoute(async (req, res) => {
    const { listing } = await orders.read(req.params.id, req.user._id);
    await orders.expire(listing._id);
    res.json((await orders.read(req.params.id, req.user._id)).order);
  }),
);
for (const action of [
  "cancel",
  "ready",
  "complete",
  "test-success",
  "test-failure",
])
  router.post(
    "/orders/:id/" + action,
    auth,
    asyncRoute(async (req, res) => {
      assertFields(req.body, ["version"]);
      res.json(
        await orders.action(req.params.id, req.user, action, req.body.version),
      );
    }),
  );
router.post(
  "/orders/:id/enquiry",
  auth,
  asyncRoute(async (req, res) => {
    assertFields(req.body, ["message"]);
    if (
      typeof req.body.message !== "string" ||
      !req.body.message.trim() ||
      req.body.message.trim().length > 2000
    )
      throw require("../lib/http").fail(
        400,
        "Message must be 1–2000 characters",
      );
    const { order } = await orders.read(req.params.id, req.user._id);
    await require("../services/blocks").assertMessaging(
      order.buyer,
      order.seller,
    );
    const Enquiry = require("../models/Enquiry");
    let enquiry;
    try {
      enquiry = await Enquiry.findOneAndUpdate(
        { buyer: order.buyer, listing: order.listingId },
        {
          $setOnInsert: {
            buyer: order.buyer,
            seller: order.seller,
            listing: order.listingId,
            title: order.title,
          },
        },
        { upsert: true, new: true, runValidators: true },
      );
    } catch (err) {
      if (err.code !== 11000) throw err;
      enquiry = await Enquiry.findOne({
        buyer: order.buyer,
        listing: order.listingId,
      });
    }
    await require("../services/enquiryMessages").send(
      enquiry,
      req.user._id,
      req.body.message.trim(),
    );
    res.status(201).json({ _id: enquiry._id });
  }),
);
module.exports = router;
