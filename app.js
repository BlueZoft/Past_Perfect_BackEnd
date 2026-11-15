const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const config = require("./lib/config");
const app = express();
app.disable("x-powered-by");
app.use(cors({ origin: config.origin, credentials: true }));
// Cookie-authenticated mutations require an exact browser origin; reject cross-site requests.
app.use((req, res, next) => {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.headers.origin !== config.origin
  )
    return res.status(403).json({ error: "Invalid request origin" });
  next();
});
app.use(express.json({ limit: "32kb" }));
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts; try later" },
});
app.use("/user/login", limiter);
app.use("/user/signup", limiter);
app.use(
  "/uploads",
  express.static(require("./services/images").directory, {
    dotfiles: "deny",
    setHeaders: (res) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'");
    },
  }),
);
app.use(require("./routes/user"));
app.use(require("./routes/offer"));
app.use(require("./routes/payment"));
app.get("/", (req, res) => res.json("Welcome to the PastPerfect API"));
app.use((req, res) => res.status(404).json({ error: "Not found" }));
app.use((err, req, res, next) => {
  const status =
    err.code === 11000
      ? 409
      : err.status || (err.name === "ValidationError" ? 400 : 500);
  res
    .status(status)
    .json({
      error:
        err.code === 11000
          ? "Email already registered"
          : status >= 500
            ? "Service unavailable"
            : err.message,
    });
});
module.exports = app;
