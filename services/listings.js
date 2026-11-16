const Offer = require("../models/Offer");
const { fail } = require("../lib/http");

exports.validateId = (id) => {
  if (typeof id !== "string" || !/^[a-fA-F0-9]{24}$/.test(id))
    throw fail(400, "Invalid listing ID");
};
exports.assertFields = (body, allowed) => {
  if (
    !body ||
    Array.isArray(body) ||
    typeof body !== "object" ||
    Object.keys(body).some((key) => !allowed.includes(key))
  )
    throw fail(400, "Unexpected listing fields");
};
exports.version = (value) => {
  if (!Number.isSafeInteger(value) || value < 0)
    throw fail(400, "A valid listing version is required");
  return value;
};
exports.owned = async (id, owner) => {
  exports.validateId(id);
  const listing = await Offer.findOne({
    _id: id,
    owner,
    status: { $ne: "removed" },
  });
  if (!listing) throw fail(404, "Listing not found");
  return listing;
};
exports.update = async (listing, version, fields) => {
  const updated = await Offer.findOneAndUpdate(
    {
      _id: listing._id,
      owner: listing.owner,
      __v: version,
      orderLock: { $ne: true },
      status: { $ne: "removed" },
      ...(fields.status === "removed"
        ? {}
        : { moderationHidden: { $ne: true } }),
    },
    { $set: fields, $inc: { __v: 1 } },
    { new: true, runValidators: true },
  ).populate("owner", "account.username account.avatar");
  if (!updated) throw fail(409, "Listing changed. Reload before trying again.");
  return updated;
};
exports.transitions = {
  active: ["reserved", "sold", "removed"],
  reserved: ["active", "sold", "removed"],
  sold: ["removed"],
};
