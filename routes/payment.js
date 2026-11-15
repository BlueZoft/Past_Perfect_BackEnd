const router = require("express").Router();
const auth = require("../middleware/isAuthenticated");
// Intentionally fail closed until orders, server-side pricing and verified webhooks exist.
router.post("/payment", auth, (req, res) =>
  res
    .status(503)
    .json({ error: "Online payments are not configured. No charge was made." }),
);
module.exports = router;
