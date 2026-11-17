const router = require("express").Router();
const auth = require("../middleware/isAuthenticated");
const { requireAdmin } = require("../services/admin");
const { asyncRoute } = require("../lib/http");
const { assertFields } = require("../services/listings");
const { listQuery } = require("../lib/listings");
const reviews = require("../services/reviews");
router.post(
  "/orders/:id/review",
  auth,
  asyncRoute(async (req, res) => {
    assertFields(req.body, ["rating", "text", "version"]);
    res
      .status(201)
      .json(await reviews.create(req.params.id, req.user, req.body));
  }),
);
router.get(
  "/seller/:id/reviews",
  asyncRoute(async (req, res) => {
    const { page, limit } = listQuery(req.query);
    res.json(await reviews.publicPage(req.params.id, page, limit));
  }),
);
router.get(
  "/admin/reviews",
  auth,
  requireAdmin,
  asyncRoute(async (req, res) => {
    const { page, limit } = listQuery(req.query);
    res.json(await reviews.adminPage(page, limit));
  }),
);
router.patch(
  "/admin/reviews/:id",
  auth,
  requireAdmin,
  asyncRoute(async (req, res) => {
    assertFields(req.body, ["version", "hidden", "reason"]);
    res.json(await reviews.moderate(req.params.id, req.user, req.body));
  }),
);
module.exports = router;
