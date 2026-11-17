const { catalogue } = require("./catalogue");
const { fail } = require("./http");
exports.parse = (raw, category) => {
  const invalid = () => fail(400, "Invalid attribute filters");
  if (
    typeof raw !== "string" ||
    raw.length > 4000 ||
    !catalogue.categories.includes(category)
  )
    throw invalid();
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    throw invalid();
  }
  if (
    !input ||
    Array.isArray(input) ||
    typeof input !== "object" ||
    Object.keys(input).length > 8
  )
    throw invalid();
  const fields = catalogue.attributes[category] || [],
    values = {},
    filter = {};
  for (const key of Object.keys(input).sort()) {
    const field = fields.find((item) => item.key === key),
      value = input[key];
    if (!field) throw invalid();
    const path = "attributes." + key;
    if (field.type === "number") {
      const valid = (n) =>
        typeof n === "number" &&
        Number.isFinite(n) &&
        n >= field.min &&
        n <= field.max;
      if (typeof value === "number") {
        if (!valid(value)) throw invalid();
        values[key] = value;
        filter[path] = value;
      } else {
        if (
          !value ||
          Array.isArray(value) ||
          typeof value !== "object" ||
          !Object.keys(value).length ||
          Object.keys(value).some((k) => !["min", "max"].includes(k))
        )
          throw invalid();
        const range = {},
          match = {};
        for (const bound of ["min", "max"])
          if (value[bound] !== undefined) {
            if (!valid(value[bound])) throw invalid();
            range[bound] = value[bound];
            match[bound === "min" ? "$gte" : "$lte"] = value[bound];
          }
        if (range.min > range.max) throw invalid();
        values[key] = range;
        filter[path] = match;
      }
    } else {
      if (
        typeof value !== "string" ||
        !value.trim() ||
        (field.type === "enum"
          ? !field.values.includes(value)
          : value.length > field.maxLength)
      )
        throw invalid();
      values[key] = value;
      filter[path] =
        field.type === "enum"
          ? value
          : new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    }
  }
  return { values, filter };
};
