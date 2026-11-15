exports.isAdmin = (id) =>
  (process.env.ADMIN_USER_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^[a-fA-F0-9]{24}$/.test(value))
    .some((value) => value.toLowerCase() === String(id).toLowerCase());
exports.requireAdmin = (req, res, next) =>
  exports.isAdmin(req.user._id)
    ? next()
    : res.status(403).json({ error: "Administrator access required" });
