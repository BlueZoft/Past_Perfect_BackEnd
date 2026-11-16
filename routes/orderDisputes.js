const router = require("express").Router();
const auth = require("../middleware/isAuthenticated");
const { requireAdmin } = require("../services/admin");
const { asyncRoute } = require("../lib/http");
const { assertFields } = require("../services/listings");
const { listQuery } = require("../lib/listings");
const disputes = require("../services/orderDisputes");
for (const [path, action, field] of [
  ["dispute", "open", "reason"],
  ["dispute-response", "respond", "response"],
  ["test-refund", "refund", "resolution"],
])
  router.post(
    "/orders/:id/" + path,
    auth,
    asyncRoute(async (req, res) => {
      assertFields(req.body, ["version", field]);
      res.json(
        await disputes.change(req.params.id, req.user, action, req.body),
      );
    }),
  );
router.get(
  "/admin/order-disputes",
  auth,
  requireAdmin,
  asyncRoute(async (req, res) => {
    const { page, limit } = listQuery(req.query);
    res.json(await disputes.page(req.query.status || "open", page, limit));
  }),
);
router.get(
  "/admin/order-disputes/:id",
  auth,
  requireAdmin,
  asyncRoute(async (req, res) => {
    const { order } = await disputes.read(req.params.id);
    const result = order.toObject();
    delete result.requestKey;
    res.json(result);
  }),
);
router.post(
  "/admin/order-disputes/:id/resolve",
  auth,
  requireAdmin,
  asyncRoute(async (req, res) => {
    assertFields(req.body, ["version", "decision", "resolution"]);
    if (!["refund", "decline"].includes(req.body.decision))
      throw require("../lib/http").fail(400, "Invalid dispute decision");
    const result = (
      await disputes.change(
        req.params.id,
        req.user,
        req.body.decision,
        req.body,
        true,
      )
    ).toObject();
    delete result.requestKey;
    res.json(result);
  }),
);
module.exports = router;
