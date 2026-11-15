const fs = require("fs");
const path = require("path");
const catalogue = JSON.parse(
  fs.readFileSync(
    path.resolve(
      process.env.CATALOGUE_FILE ||
        path.join(__dirname, "../config/catalogue.json"),
    ),
    "utf8",
  ),
);
const slug = (value) =>
  typeof value === "string" && /^[a-z][a-z0-9-]{0,79}$/.test(value);
const label = (value) =>
  typeof value === "string" &&
  value.trim() === value &&
  value.length > 0 &&
  value.length <= 120;
const unique = (values) => new Set(values).size === values.length;
if (
  !Array.isArray(catalogue.categories) ||
  !catalogue.categories.includes("other") ||
  !catalogue.categories.every(slug) ||
  !unique(catalogue.categories) ||
  !Array.isArray(catalogue.locations) ||
  !unique(catalogue.locations.map((item) => item?.id)) ||
  !catalogue.locations.every(
    (item) =>
      item &&
      slug(item.id) &&
      label(item.label) &&
      Array.isArray(item.towns) &&
      item.towns.every(label) &&
      unique(item.towns),
  )
)
  throw new Error("Invalid catalogue configuration");
catalogue.attributes = catalogue.attributes || {};
if (
  typeof catalogue.attributes !== "object" ||
  Array.isArray(catalogue.attributes) ||
  Object.entries(catalogue.attributes).some(
    ([category, fields]) =>
      !catalogue.categories.includes(category) ||
      !Array.isArray(fields) ||
      fields.length > 8 ||
      !unique(fields.map((field) => field?.key)) ||
      fields.some(
        (field) =>
          !field ||
          typeof field.key !== "string" ||
          !/^[a-z][a-zA-Z0-9]{0,39}$/.test(field.key) ||
          ["constructor", "prototype"].includes(field.key) ||
          !["text", "number", "enum"].includes(field.type) ||
          (field.required !== undefined &&
            typeof field.required !== "boolean") ||
          !field.label ||
          !["en", "si", "ta"].every((locale) => label(field.label[locale])) ||
          (field.type === "text" &&
            (!Number.isInteger(field.maxLength) ||
              field.maxLength < 1 ||
              field.maxLength > 200)) ||
          (field.type === "number" &&
            (!Number.isFinite(field.min) ||
              !Number.isFinite(field.max) ||
              field.min > field.max)) ||
          (field.type === "enum" &&
            (!Array.isArray(field.values) ||
              !field.values.length ||
              field.values.length > 30 ||
              !field.values.every(label) ||
              !unique(field.values))),
      ),
  )
)
  throw new Error("Invalid catalogue attributes");
exports.catalogue = catalogue;
exports.validLocation = (district, town) =>
  (!district && !town) ||
  catalogue.locations.some(
    (location) =>
      location.id === district && (!town || location.towns.includes(town)),
  );
