const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { fail } = require("../lib/http");
exports.enabled = () =>
  ["local", "smtp"].includes(process.env.MAIL_DRIVER || "");
exports.send = async ({ to, subject, text }) => {
  const driver = process.env.MAIL_DRIVER || "disabled";
  if (driver === "local") {
    if (process.env.NODE_ENV === "production")
      throw fail(503, "Configure SMTP for production email");
    const directory = path.resolve(
      process.env.MAIL_OUTBOX_DIR || ".mail-outbox",
    );
    const uploads = path.resolve(process.env.UPLOAD_DIR || "./uploads");
    if (directory === uploads || directory.startsWith(uploads + path.sep))
      throw fail(503, "Email outbox must be private");
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    await fs.writeFile(
      path.join(directory, crypto.randomUUID() + ".json"),
      JSON.stringify({ to, subject, text }, null, 2),
      { mode: 0o600 },
    );
    return;
  }
  if (driver !== "smtp") throw fail(503, "Email delivery is not configured");
  for (const key of ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "MAIL_FROM"])
    if (!process.env[key] || process.env[key].startsWith("REPLACE_"))
      throw fail(503, "Email delivery is not configured");
  const port = Number(process.env.SMTP_PORT || 587);
  if (![465, 587].includes(port))
    throw fail(503, "Use a supported secure SMTP port");
  const transport = require("nodemailer").createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    tls: { minVersion: "TLSv1.2" },
    connectionTimeout: 10000,
    socketTimeout: 15000,
  });
  await transport.sendMail({ from: process.env.MAIL_FROM, to, subject, text });
};
