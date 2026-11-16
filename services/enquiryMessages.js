const User = require("../models/User");
const Message = require("../models/Message");
const Enquiry = require("../models/Enquiry");
const { fail } = require("../lib/http");
exports.send = async function (enquiry, user, value) {
  const recipient =
    String(user) === String(enquiry.buyer) ? enquiry.seller : enquiry.buyer;
  if (!(await User.exists({ _id: recipient, suspended: { $ne: true } })))
    throw fail(403, "Messaging is unavailable for this account");
  const message = await Message.create({
    enquiry: enquiry._id,
    sender: user,
    text: value,
  });
  await Enquiry.updateOne(
    { _id: enquiry._id },
    { $max: { lastMessageAt: message.createdAt } },
  );

  await require("../services/notifications").notify(
    recipient,
    "message",
    "/enquiries/" + enquiry._id,
    "message:" + message._id,
  );
  return message;
};
