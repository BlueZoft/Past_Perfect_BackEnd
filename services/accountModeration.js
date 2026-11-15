const User = require("../models/User");
const { fail } = require("../lib/http");
const { isAdmin } = require("./admin");
const { version } = require("./listings");
exports.change = async (id, expected, suspended, reason, actor, appealId) => {
  version(expected);
  if (String(id) === String(actor) || isAdmin(id))
    throw fail(400, "Administrator accounts cannot be suspended here");
  const filter = { _id: id, suspended: suspended ? { $ne: true } : true };
  if (expected === 0)
    filter.$or = [
      { moderationVersion: 0 },
      { moderationVersion: { $exists: false } },
    ];
  else filter.moderationVersion = expected;
  if (appealId)
    filter.appeals = {
      $elemMatch: {
        _id: appealId,
        status: "open",
        moderationVersion: expected,
      },
    };
  const set = { suspended, suspensionReason: suspended ? reason : "" };
  const current = !suspended
    ? await User.findOne(filter).select("appeals").lean()
    : null;
  const closeAppeals = !suspended && Array.isArray(current?.appeals);
  if (closeAppeals)
    Object.assign(set, {
      "appeals.$[open].status": "accepted",
      "appeals.$[open].resolution": reason,
      "appeals.$[open].reviewedAt": new Date(),
    });
  const user = await User.findOneAndUpdate(
    filter,
    {
      $set: set,
      $inc: { moderationVersion: 1, authVersion: 1 },
      $push: {
        accountModerationAudit: {
          $each: [
            {
              actor,
              action: suspended ? "suspend" : "restore",
              reason,
              at: new Date(),
            },
          ],
          $slice: -100,
        },
      },
    },
    {
      new: true,
      runValidators: true,
      ...(closeAppeals
        ? {
            arrayFilters: [
              { "open.status": "open", "open.moderationVersion": expected },
            ],
          }
        : {}),
    },
  );
  if (!user) throw fail(409, "Account changed. Reload before trying again.");
  await require("./notifications").notify(
    user._id,
    "account",
    "/account-status",
    "account:" + user._id + ":" + user.moderationVersion,
  );
  return user;
};
