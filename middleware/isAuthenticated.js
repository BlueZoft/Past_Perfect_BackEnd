const Session = require("../models/Session");
const { digest, readToken } = require("../services/session");
const { asyncRoute, fail } = require("../lib/http");
module.exports = asyncRoute(async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  const token = readToken(req);
  if (!/^[a-f0-9]{64}$/.test(token)) throw fail(401, "Authentication required");
  const session = await Session.findOne({
    digest: digest(token),
    expiresAt: { $gt: new Date() },
  }).populate("user");
  if (
    !session ||
    !session.user ||
    (session.authVersion || 0) !== (session.user.authVersion || 0)
  )
    throw fail(401, "Session expired");
  req.user = session.user;
  req.session = session;
  const allowed =
    (req.method === "GET" &&
      ["/user/me", "/user/appeals", "/user/notifications"].includes(
        req.path,
      )) ||
    (req.method === "POST" &&
      [
        "/user/logout",
        "/user/appeals",
        "/user/notifications/read-all",
        "/user/verification/request",
      ].includes(req.path)) ||
    (req.method === "PATCH" &&
      /^\/user\/notifications\/[a-f0-9]{24}\/read$/.test(req.path));
  const orderAccess =
    (req.method === "GET" &&
      (req.path === "/user/orders" ||
        /^\/orders\/[a-f0-9]{24}$/.test(req.path))) ||
    (req.method === "POST" &&
      /^\/orders\/[a-f0-9]{24}\/(cancel|dispute|dispute-response|test-refund)$/.test(
        req.path,
      ));
  if (req.user.suspended && !allowed && !orderAccess)
    throw fail(403, "Account suspended. Open account status to appeal.");
  next();
});
