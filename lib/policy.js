const fs = require("fs");
const path = require("path");
const { fail } = require("./http");
const policy = JSON.parse(
  fs.readFileSync(
    path.resolve(
      process.env.POLICY_FILE || path.join(__dirname, "../config/policy.json"),
    ),
    "utf8",
  ),
);
const label = (value) =>
  value &&
  ["en", "si", "ta"].every(
    (locale) =>
      typeof value[locale] === "string" &&
      value[locale].trim() &&
      value[locale].length <= 1000,
  );
if (
  typeof policy.version !== "string" ||
  !policy.version ||
  policy.version.length > 80 ||
  !label(policy.notice) ||
  !Array.isArray(policy.rules) ||
  policy.rules.length > 100 ||
  !policy.rules.every(
    (rule) =>
      /^[a-z][a-z0-9-]{0,79}$/.test(rule.id) &&
      ["reject", "review"].includes(rule.action) &&
      label(rule.label) &&
      Array.isArray(rule.terms) &&
      rule.terms.length > 0 &&
      rule.terms.length <= 30 &&
      rule.terms.every(
        (term) =>
          typeof term === "string" &&
          term.trim().length >= 3 &&
          term.length <= 80,
      ),
  ) ||
  new Set(policy.rules.map((rule) => rule.id)).size !== policy.rules.length
)
  throw new Error("Invalid policy configuration");
exports.policy = policy;
exports.evaluate = (listing) => {
  const text = (listing.title + "\n" + listing.description)
    .normalize("NFKC")
    .toLowerCase();
  const matches = policy.rules.filter((rule) =>
    rule.terms.some((term) =>
      text.includes(term.normalize("NFKC").trim().toLowerCase()),
    ),
  );
  if (matches.some((rule) => rule.action === "reject"))
    throw fail(400, "This listing conflicts with marketplace rules");
  return {
    policyVersion: policy.version,
    policyRuleIds: matches.map((rule) => rule.id),
    policyReview: matches.some((rule) => rule.action === "review"),
    ...(matches.length ? { moderationHidden: true } : {}),
  };
};
