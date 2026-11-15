const Session = require("../models/Session");
const { digest, readToken } = require("../services/session");
const { asyncRoute, fail } = require("../lib/http");
module.exports = asyncRoute(async (req, res, next) => {
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
  next();
});
