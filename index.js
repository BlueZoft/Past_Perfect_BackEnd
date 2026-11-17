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
  let alerting = false;
  const alertSweep = async () => {
    if (alerting) return;
    alerting = true;
    try {
      await require("./services/searchAlerts").run();
    } catch {
      console.error("Search alert retry pending");
    } finally {
      alerting = false;
    }
  };
  const alertTimer = setInterval(alertSweep, 60000);
  alertTimer.unref();
  void alertSweep();
  const expireTimer = setInterval(sweep, 60000);
  expireTimer.unref();
  void sweep();
  const server = app.listen(config.port, () =>
    console.log(`API listening on ${config.port}`),
  );
  const stop = () => {
    clearInterval(expireTimer);
    clearInterval(alertTimer);
    server.close(() => mongoose.disconnect().then(() => process.exit(0)));
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
start().catch(() => {
  console.error("API startup failed: check MongoDB and configuration");
  process.exit(1);
});
