const { fail } = require("../lib/http");
exports.current = () => {
  const fee = Number(process.env.ORDER_PLATFORM_FEE_MINOR || 0),
    minutes = Number(process.env.ORDER_HOLD_MINUTES || 15);
  if (
    !Number.isSafeInteger(fee) ||
    fee < 0 ||
    fee > 100000000 ||
    !Number.isSafeInteger(minutes) ||
    minutes < 1 ||
    minutes > 60
  )
    throw fail(503, "Invalid order configuration");
  const paymentMode =
    process.env.PAYMENT_DRIVER === "test" &&
    process.env.NODE_ENV !== "production"
      ? "test"
      : "disabled";
  return {
    paymentMode,
    platformFeeMinor: fee,
    holdMinutes: minutes,
    currency: "LKR",
    fulfilment: "collection",
  };
};
exports.requireTest = () => {
  if (exports.current().paymentMode !== "test")
    throw fail(503, "Order payments are not configured. No charge was made.");
};
