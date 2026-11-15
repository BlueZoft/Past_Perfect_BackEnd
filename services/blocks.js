const Block = require("../models/Block");
const { fail } = require("../lib/http");
exports.assertMessaging = async (first, second) => {
  if (
    await Block.exists({
      $or: [
        { user: first, blocked: second },
        { user: second, blocked: first },
      ],
    })
  )
    throw fail(403, "Messaging is unavailable between these accounts");
};
