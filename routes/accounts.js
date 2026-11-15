const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcrypt");
const User = require("../models/User");
const Session = require("../models/Session");
const auth = require("../middleware/isAuthenticated");
const tokens = require("../services/accountTokens");
const mail = require("../services/mail");
const { cookieOptions } = require("../services/session");
const { notify } = require("../services/notifications");
const { asyncRoute, fail } = require("../lib/http");
const { assertFields } = require("../services/listings");
const limit = () =>
  rateLimit({
    windowMs: 15 * 60000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many attempts; try later" },
  });
router.post(
  "/user/verification/request",
  auth,
  limit(),
  asyncRoute(async (req, res) => {
    assertFields(req.body, ["locale"]);
    if (req.user.emailVerifiedAt)
      return res.status(202).json({ message: "Email already verified" });
    await tokens.request(req.user, "verify", req.body.locale);
    res
      .status(202)
      .json({ message: "Check your email for a verification link" });
  }),
);
router.post(
  "/user/verification/confirm",
  limit(),
  asyncRoute(async (req, res) => {
    assertFields(req.body, ["token"]);
    const digest = tokens.validate(req.body.token);
    const user = await User.findOneAndUpdate(
      {
        "verificationToken.digest": digest,
        "verificationToken.expiresAt": { $gt: new Date() },
      },
      {
        $set: { emailVerifiedAt: new Date() },
        $unset: { verificationToken: "" },
      },
      { new: true },
    );
    if (!user) throw fail(400, "Invalid or expired link");
    await notify(user._id, "verification", "/profile", "verified:" + user._id);
    res.json({ message: "Email verified. You can now sign in." });
  }),
);
router.post(
  "/user/recovery/request",
  limit(),
  asyncRoute(async (req, res) => {
    assertFields(req.body, ["email", "locale"]);
    if (
      typeof req.body.email !== "string" ||
      req.body.email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email.trim())
    )
      throw fail(400, "Valid email required");
    if (!mail.enabled()) throw fail(503, "Email delivery is not configured");
    const user = await User.findOne({
      email: req.body.email.trim().toLowerCase(),
    });
    // Match response and a minimum duration for existing/nonexisting accounts; never return tokens.
    const start = Date.now();
    if (user) {
      try {
        await tokens.request(user, "reset", req.body.locale);
      } catch {
        console.error("Recovery email delivery failed");
      }
    }
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, 350 - (Date.now() - start))),
    );
    res
      .status(202)
      .json({
        message: "If this account exists, a recovery email has been sent",
      });
  }),
);
router.post(
  "/user/recovery/confirm",
  limit(),
  asyncRoute(async (req, res) => {
    assertFields(req.body, ["token", "password"]);
    const digest = tokens.validate(req.body.token);
    if (
      typeof req.body.password !== "string" ||
      req.body.password.length < 8 ||
      Buffer.byteLength(req.body.password) > 72
    )
      throw fail(
        400,
        "Password must be 8 characters or more and at most 72 bytes",
      );
    const hash = await bcrypt.hash(req.body.password, 12);
    const user = await User.findOneAndUpdate(
      {
        "recoveryToken.digest": digest,
        "recoveryToken.expiresAt": { $gt: new Date() },
      },
      {
        $set: { hash },
        $inc: { authVersion: 1 },
        $unset: { recoveryToken: "" },
      },
      { new: true },
    );
    if (!user) throw fail(400, "Invalid or expired link");
    try {
      await Session.deleteMany({ user: user._id });
    } catch {
      console.error(
        "Stale session cleanup pending; authentication versions remain enforced",
      );
    }
    res.clearCookie("session", cookieOptions);
    res.json({ message: "Password reset. Sign in with your new password." });
  }),
);
module.exports = router;
