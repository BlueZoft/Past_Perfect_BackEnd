const mongoose = require("mongoose");
const { createHash } = require("crypto");
const User = require("../models/User");
const { listQuery } = require("../lib/listings");
const { assertFields, validateId } = require("./listings");
const { fail } = require("../lib/http");
const keys = [
  "q",
  "title",
  "category",
  "district",
  "town",
  "condition",
  "size",
  "priceMin",
  "priceMax",
  "sort",
];
function name(value) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 80)
    throw fail(400, "Search name must be 1–80 characters");
  return value.trim();
}
exports.query = (input) => {
  assertFields(input, keys);
  const query = {};
  for (const key of keys) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== "string")
      throw fail(400, "Invalid saved search filters");
    // Title search keeps literal spaces; keyword search shares its NFKC normalization.
    const value = key === "title" ? input[key] : input[key].trim();
    if (value) query[key] = key === "q" ? value.normalize("NFKC") : value;
  }
  listQuery(query);
  for (const key of ["priceMin", "priceMax"])
    if (query[key] !== undefined) query[key] = String(Number(query[key]));
  query.sort = query.sort || (query.q ? "relevance" : "newest");
  return query;
};
function publicRecord(record) {
  const result = record.toObject({ flattenMaps: true });
  delete result.fingerprint;
  return result;
}
exports.page = async (user) => {
  const account = await User.findById(user).select("+savedSearches");
  const searches = [...account.savedSearches].sort(
    (a, b) =>
      b.createdAt - a.createdAt || String(b._id).localeCompare(String(a._id)),
  );
  return {
    searches: searches.map(publicRecord),
    count: searches.length,
    limit: 25,
  };
};
exports.create = async (user, input) => {
  const query = exports.query(input.query);
  // Sorted key order makes equivalent price/default-sort representations duplicate-safe.
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify(
        Object.entries(query).sort(([a], [b]) => a.localeCompare(b)),
      ),
    )
    .digest("hex");
  const record = {
    _id: new mongoose.Types.ObjectId(),
    name: name(input.name),
    query,
    fingerprint,
    revision: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const account = await User.findOneAndUpdate(
    {
      _id: user,
      suspended: { $ne: true },
      "savedSearches.fingerprint": { $ne: fingerprint },
      "savedSearches.24": { $exists: false },
    },
    { $push: { savedSearches: record } },
    { new: true, runValidators: true },
  ).select("+savedSearches");
  if (!account) {
    const duplicate = await User.exists({
      _id: user,
      "savedSearches.fingerprint": fingerprint,
    });
    throw fail(
      409,
      duplicate
        ? "This search is already saved"
        : "Saved search limit reached or account unavailable",
    );
  }
  return publicRecord(
    account.savedSearches.find(
      (item) => String(item._id) === String(record._id),
    ),
  );
};
exports.change = async (user, id, input, remove = false) => {
  validateId(id);
  if (!Number.isSafeInteger(input.version) || input.version < 0)
    throw fail(400, "A valid saved search version is required");
  const filter = {
    _id: user,
    suspended: { $ne: true },
    savedSearches: { $elemMatch: { _id: id, revision: input.version } },
  };
  const update = remove
    ? { $pull: { savedSearches: { _id: id, revision: input.version } } }
    : {
        $set: {
          "savedSearches.$.name": name(input.name),
          "savedSearches.$.updatedAt": new Date(),
        },
        $inc: { "savedSearches.$.revision": 1 },
      };
  const account = await User.findOneAndUpdate(filter, update, {
    new: true,
    runValidators: true,
  }).select("+savedSearches");
  if (!account) {
    const found = await User.exists({ _id: user, "savedSearches._id": id });
    throw fail(
      found ? 409 : 404,
      found
        ? "Saved search changed. Refresh before trying again."
        : "Saved search not found",
    );
  }
  if (!remove)
    return publicRecord(
      account.savedSearches.find(
        (item) => String(item._id) === id.toLowerCase(),
      ),
    );
};
