const mongoose = require("mongoose");
const config = require("../lib/config");
async function run() {
  await mongoose.connect(config.mongoUri);
  const afterArg = process.argv.find((value) => value.startsWith("--after="));
  console.log(
    JSON.stringify(
      await require("../services/localOrphans").scan({
        apply: process.argv.includes("--apply"),
        graceHours: Number(process.env.MEDIA_ORPHAN_GRACE_HOURS || 24),
        after: afterArg ? afterArg.slice(8) : "",
      }),
    ),
  );
}
run()
  .catch(() => {
    console.error(
      "Orphan scan failed; check the local driver, storage and database",
    );
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
