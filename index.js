const mongoose = require("mongoose");
const config = require("./lib/config");
const app = require("./app");
async function start() {
  await mongoose.connect(config.mongoUri);
  let expiring = false;
  const sweep = async () => {
    if (expiring) return;
    expiring = true;
    try {
      await require("./services/orders").expireBatch();
    } catch {
      console.error("Order expiry retry pending");
    } finally {
      expiring = false;
    }
  };
  const expireTimer = setInterval(sweep, 60000);
  expireTimer.unref();
  void sweep();
  const server = app.listen(config.port, () =>
    console.log(`API listening on ${config.port}`),
  );
  const stop = () => {
    clearInterval(expireTimer);
    server.close(() => mongoose.disconnect().then(() => process.exit(0)));
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
start().catch(() => {
  console.error("API startup failed: check MongoDB and configuration");
  process.exit(1);
});
