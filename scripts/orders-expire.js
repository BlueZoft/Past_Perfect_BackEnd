const mongoose = require("mongoose");
const config = require("../lib/config");
async function run() {
  await mongoose.connect(config.mongoUri);
  console.log(
    JSON.stringify({
      expired: await require("../services/orders").expireBatch(),
      batchLimit: 100,
    }),
  );
}
run()
  .catch(() => {
    console.error("Order expiry failed; check database availability");
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
