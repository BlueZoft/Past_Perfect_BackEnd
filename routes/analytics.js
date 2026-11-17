const router = require("express").Router();
const auth = require("../middleware/isAuthenticated");
const { asyncRoute } = require("../lib/http");
const Offer = require("../models/Offer");
router.get(
  "/user/analytics",
  auth,
  asyncRoute(async (req, res) => {
    const owner = req.user._id;
    await require("../services/orders").expireBatch({ owner });
    const [result] = await Offer.aggregate([
      { $match: { owner } },
      {
        $facet: {
          listings: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
          hidden: [{ $match: { moderationHidden: true } }, { $count: "count" }],
          orders: [
            { $unwind: "$orders" },
            { $match: { "orders.seller": owner } },
            { $group: { _id: "$orders.status", count: { $sum: 1 } } },
          ],
          simulated: [
            { $unwind: "$orders" },
            {
              $match: {
                "orders.seller": owner,
                "orders.paymentMode": "test",
                "orders.status": {
                  $in: [
                    "confirmed",
                    "ready",
                    "completed",
                    "disputed",
                    "refunded",
                  ],
                },
              },
            },
            {
              $group: {
                _id: null,
                paidMinor: { $sum: "$orders.totalMinor" },
                refundedMinor: {
                  $sum: { $ifNull: ["$orders.dispute.refundMinor", 0] },
                },
              },
            },
          ],
        },
      },
    ]);
    res.json({
      listings: Object.fromEntries(
        result.listings.map((item) => [item._id, item.count]),
      ),
      hiddenListings: result.hidden[0]?.count || 0,
      orders: Object.fromEntries(
        result.orders.map((item) => [item._id, item.count]),
      ),
      simulated: {
        paidMinor: result.simulated[0]?.paidMinor || 0,
        refundedMinor: result.simulated[0]?.refundedMinor || 0,
        currency: "LKR",
      },
    });
  }),
);
module.exports = router;
