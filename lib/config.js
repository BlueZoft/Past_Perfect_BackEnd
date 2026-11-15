require("dotenv").config();
module.exports = {
  port: Number(process.env.PORT || 3001),
  mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pastperfect",
  origin: process.env.WEB_ORIGIN || "http://localhost:3000",
  secure: process.env.NODE_ENV === "production",
  sessionMs: 24 * 60 * 60 * 1000,
};
