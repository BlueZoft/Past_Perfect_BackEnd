const mongoose = require("mongoose");
const config = require("../lib/config");
async function run() {
  await mongoose.connect(config.mongoUri);
  console.log(JSON.stringify(await require("../services/searchAlerts").run()));
}
run()
  .catch(() => {
    console.error(
      "Search alert batch failed; retry after checking database/configuration",
    );
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
