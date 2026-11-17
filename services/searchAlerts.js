const mongoose = require("mongoose");
const User = require("../models/User");
const Notification = require("../models/Notification");
const JobState = require("../models/JobState");
const { listQuery } = require("../lib/listings");
const lowId = new mongoose.Types.ObjectId("000000000000000000000000");
function delay() {
  const value = Number(process.env.SEARCH_ALERT_DELAY_SECONDS ?? 60);
  if (!Number.isInteger(value) || value < 0 || value > 3600)
    throw new Error("Invalid search alert delay");
  return value * 1000;
}
exports.search = async (user, saved, cutoff, batch = 10) => {
  if (
    !saved.alertsSince ||
    !saved.alertCursor?.at ||
    saved.alertCursor.at >= cutoff
  )
    return 0;
  const cursor = saved.alertCursor;
  const live = {
    _id: user,
    suspended: { $ne: true },
    savedSearches: {
      $elemMatch: {
        _id: saved._id,
        revision: saved.revision,
        alertsEnabled: true,
      },
    },
  };
  let filter;
  try {
    filter = listQuery(Object.fromEntries(saved.query)).filter;
  } catch (err) {
    if (err.status === 400) return 0;
    throw err;
  } // Changed catalogue: retain preferences, skip invalid filters.
  filter.owner = { $ne: user };
  filter.$and = [
    {
      $or: [
        { createdAt: { $gt: cursor.at } },
        { createdAt: cursor.at, _id: { $gt: cursor.id || lowId } },
      ],
    },
    { createdAt: { $gte: saved.alertsSince, $lte: cutoff } },
  ];
  const result = await require("./publicListings").page(
    filter,
    { createdAt: 1, _id: 1 },
    1,
    batch,
  );
  await Notification.init();
  let delivered = 0;
  for (const offer of result.offers) {
    if (!(await User.exists(live))) return delivered;
    // Recheck visibility immediately before persisting, then retry idempotently on a lost batch.
    const visible = await require("./publicListings").page(
      { ...filter, _id: offer._id },
      { _id: 1 },
      1,
      1,
    );
    if (!visible.count) continue;
    try {
      const write = await Notification.updateOne(
        { user, event: "search:" + saved._id + ":" + offer._id },
        {
          $setOnInsert: {
            user,
            type: "search",
            link: "/offer/" + offer._id,
            event: "search:" + saved._id + ":" + offer._id,
          },
        },
        { upsert: true, runValidators: true },
      );
      delivered += write.upsertedCount || 0;
    } catch (err) {
      if (err.code !== 11000) throw err;
    }
  }
  const last = result.offers.at(-1);
  // Wrap a completed pass to catch late inserts; notification event keys deduplicate rescans.
  const next =
    result.offers.length === batch
      ? { at: last.createdAt, id: last._id }
      : { at: saved.alertsSince, id: lowId };
  await User.updateOne(
    {
      ...live,
      savedSearches: {
        $elemMatch: {
          _id: saved._id,
          revision: saved.revision,
          alertsEnabled: true,
          "alertCursor.at": cursor.at,
          "alertCursor.id": cursor.id,
        },
      },
    },
    { $set: { "savedSearches.$.alertCursor": next } },
  );
  return delivered;
};
exports.run = async () => {
  const cutoff = new Date(Date.now() - delay());
  const state = await JobState.findById("search-alerts");
  const users = await User.find({
    suspended: { $ne: true },
    "savedSearches.alertsEnabled": true,
    ...(state?.afterUser ? { _id: { $gt: state.afterUser } } : {}),
  })
    .select("+savedSearches")
    .sort({ _id: 1 })
    .limit(10);
  let delivered = 0;
  for (const user of users)
    for (const saved of user.savedSearches)
      if (saved.alertsEnabled)
        delivered += await exports.search(user._id, saved, cutoff);
  await JobState.updateOne(
    { _id: "search-alerts" },
    { $set: { afterUser: users.length === 10 ? users.at(-1)._id : null } },
    { upsert: true },
  );
  return {
    users: users.length,
    delivered,
    userBatchLimit: 10,
    listingBatchLimit: 10,
  };
};
