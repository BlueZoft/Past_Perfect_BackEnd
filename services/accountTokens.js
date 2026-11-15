const crypto = require("crypto");
const User = require("../models/User");
const mail = require("./mail");
const config = require("../lib/config");
const { fail } = require("../lib/http");
exports.digest = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");
const copy = {
  en: {
    verify: "Verify your PastPerfect email",
    reset: "Reset your PastPerfect password",
    intro:
      "Open this link and confirm the action. This link expires in 30 minutes. If you did not request this, ignore this email.",
  },
  si: {
    verify: "ඔබගේ PastPerfect විද්‍යුත් තැපෑල තහවුරු කරන්න",
    reset: "ඔබගේ PastPerfect මුරපදය යළි සකසන්න",
    intro:
      "මෙම සබැඳිය විවෘත කර ක්‍රියාව තහවුරු කරන්න. සබැඳිය මිනිත්තු 30කින් කල් ඉකුත් වේ. ඔබ මෙය ඉල්ලා නොසිටියේ නම් මෙම පණිවිඩය නොසලකා හරින්න.",
  },
  ta: {
    verify: "உங்கள் PastPerfect மின்னஞ்சலை உறுதிப்படுத்தவும்",
    reset: "உங்கள் PastPerfect கடவுச்சொல்லை மீட்டமைக்கவும்",
    intro:
      "இந்த இணைப்பைத் திறந்து செயலை உறுதிப்படுத்தவும். இணைப்பு 30 நிமிடங்களில் காலாவதியாகும். நீங்கள் இதைக் கோரவில்லை என்றால் இந்த மின்னஞ்சலைப் புறக்கணிக்கவும்.",
  },
};
exports.request = async (user, purpose, locale = "en") => {
  if (!mail.enabled()) throw fail(503, "Email delivery is not configured");
  const origin = new URL(config.origin);
  if (process.env.NODE_ENV === "production" && origin.protocol !== "https:")
    throw fail(503, "Configure an HTTPS web origin");
  const token = crypto.randomBytes(32).toString("hex");
  const field = purpose === "verify" ? "verificationToken" : "recoveryToken";
  const digest = exports.digest(token);
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        [field]: { digest, expiresAt: new Date(Date.now() + 30 * 60000) },
      },
    },
  );
  const language = ["en", "si", "ta"].includes(locale) ? copy[locale] : copy.en;
  const url = new URL(
    purpose === "verify" ? "/verify-email" : "/reset-password",
    origin,
  );
  url.hash = "token=" + token;
  try {
    await mail.send({
      to: user.email,
      subject: language[purpose],
      text: language.intro + "\n\n" + url.toString(),
    });
  } catch (err) {
    await User.updateOne(
      { _id: user._id, [field + ".digest"]: digest },
      { $unset: { [field]: "" } },
    );
    throw err;
  }
};
exports.validate = (token) => {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
    throw fail(400, "Invalid or expired link");
  return exports.digest(token);
};
