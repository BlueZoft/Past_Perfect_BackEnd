const mongoose = require("mongoose");
const config = require("./lib/config");
const app = require("./app");
async function start() {
  await mongoose.connect(config.mongoUri);
  const server = app.listen(config.port, () =>
    console.log(`API listening on ${config.port}`),
  );
  const stop = () =>
    server.close(() => mongoose.disconnect().then(() => process.exit(0)));
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
start().catch(() => {
  console.error("API startup failed: check MongoDB and configuration");
  process.exit(1);
});
