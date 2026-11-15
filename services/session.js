const crypto = require("crypto");
const Session = require("../models/Session");
const config = require("../lib/config");
const digest = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");
const cookieOptions = {
  httpOnly: true,
  secure: config.secure,
  sameSite: "strict",
  path: "/",
};
exports.digest = digest;
exports.cookieOptions = cookieOptions;
exports.issue = async (user, res) => {
  const token = crypto.randomBytes(32).toString("hex");
  await Session.create({
    digest: digest(token),
    user: user._id,
    expiresAt: new Date(Date.now() + config.sessionMs),
  });
  res.cookie("session", token, { ...cookieOptions, maxAge: config.sessionMs });
};
exports.readToken = (req) => {
  const match = (req.headers.cookie || "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("session="));
  return match ? match.slice(8) : "";
};
