const router = require("express").Router();
const bcrypt = require("bcrypt");
const User = require("../models/User");
const auth = require("../middleware/isAuthenticated");
const { issue, cookieOptions } = require("../services/session");
const { asyncRoute, fail } = require("../lib/http");
const publicUser = require("../services/publicUser");
function credentials(body) {
  if (
    typeof body.email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) ||
    body.email.length > 254
  )
    throw fail(400, "Valid email required");
  if (
    typeof body.password !== "string" ||
    body.password.length < 8 ||
    Buffer.byteLength(body.password) > 72
  )
    throw fail(
      400,
      "Password must be 8 characters or more and at most 72 bytes",
    );
  return body.email.trim().toLowerCase();
}
router.post(
  "/user/signup",
  asyncRoute(async (req, res) => {
    const email = credentials(req.body);
    const username =
      typeof req.body.username === "string" ? req.body.username.trim() : "";
    if (!username || username.length > 80)
      throw fail(400, "Username must be 1–80 characters");
    const user = await User.create({
      email,
      account: { username },
      hash: await bcrypt.hash(req.body.password, 12),
    });
    if (require("../services/mail").enabled()) {
      try {
        await require("../services/accountTokens").request(
          user,
          "verify",
          req.body.locale,
        );
      } catch {
        console.error("Signup verification email delivery failed");
      }
    }
    await issue(user, res);
    res.status(201).json(publicUser(user));
  }),
);
router.post(
  "/user/login",
  asyncRoute(async (req, res) => {
    const email = credentials(req.body);
    const user = await User.findOne({ email }).select("+hash");
    // Compare even for unknown users to reduce account enumeration through timing.
    const hash = user
      ? user.hash
      : "$2b$12$C6UzMDM.H6dfI/f/IKcEe.5ZJ9gP9pOqQgZ15JqKfI4xL6uVn0H0e";
    const matches = await bcrypt.compare(req.body.password, hash);
    if (!user || !matches) throw fail(401, "Incorrect email or password");
    await issue(user, res);
    res.json(publicUser(user));
  }),
);
router.get("/user/me", auth, (req, res) => res.json(publicUser(req.user)));
router.post(
  "/user/logout",
  auth,
  asyncRoute(async (req, res) => {
    await req.session.deleteOne();
    res.clearCookie("session", cookieOptions);
    res.status(204).end();
  }),
);
module.exports = router;
