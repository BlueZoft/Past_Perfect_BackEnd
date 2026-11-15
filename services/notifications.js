const Notification = require("../models/Notification");
exports.notify = async (user, type, link, event) => {
  try {
    await Notification.updateOne(
      { user, event },
      { $setOnInsert: { user, type, link, event } },
      { upsert: true, runValidators: true },
    );
  } catch (err) {
    if (err.code !== 11000)
      console.error(
        "Notification persistence failed; inspect database availability",
      );
  }
};
