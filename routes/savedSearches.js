const router = require("express").Router();
const auth = require("../middleware/isAuthenticated");
const { asyncRoute } = require("../lib/http");
const { assertFields } = require("../services/listings");
const searches = require("../services/savedSearches");
router.get(
  "/user/saved-searches",
  auth,
  asyncRoute(async (req, res) => res.json(await searches.page(req.user._id))),
);
router.post(
  "/user/saved-searches",
  auth,
  asyncRoute(async (req, res) => {
    assertFields(req.body, ["name", "query", "alertsEnabled"]);
    res.status(201).json(await searches.create(req.user._id, req.body));
  }),
);
router.patch(
  "/user/saved-searches/:id",
  auth,
  asyncRoute(async (req, res) => {
    assertFields(req.body, ["name", "version", "alertsEnabled"]);
    res.json(await searches.change(req.user._id, req.params.id, req.body));
  }),
);
router.delete(
  "/user/saved-searches/:id",
  auth,
  asyncRoute(async (req, res) => {
    assertFields(req.body, ["version"]);
    await searches.change(req.user._id, req.params.id, req.body, true);
    res.sendStatus(204);
  }),
);
module.exports = router;
