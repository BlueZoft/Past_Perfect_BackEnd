const { fail } = require("./http");
const conditions = ["New with Tags", "Like New", "Fairly Used", "Used", "Worn"];
exports.validateListing = (body) => {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description =
    typeof body.description === "string" ? body.description.trim() : "";
  const price =
    typeof body.price === "string" || typeof body.price === "number"
      ? Number(body.price)
      : NaN;
  if (
    title.length < 3 ||
    title.length > 120 ||
    description.length < 10 ||
    description.length > 4000
  )
    throw fail(400, "Title must be 3–120 and description 10–4000 characters");
  if (!Number.isSafeInteger(price) || price < 1 || price > 1000000000)
    throw fail(400, "Price must be a whole LKR amount from 1 to 1000000000");
  if (
    !conditions.includes(body.condition) ||
    !["", "XS", "S", "M", "L", "XL", "XXL"].includes(body.size || "")
  )
    throw fail(400, "Invalid condition or size");
  return {
    title,
    description,
    price,
    condition: body.condition,
    size: body.size || "",
  };
};
exports.listQuery = (query) => {
  const integer = (key, fallback, max) => {
    if (query[key] === undefined) return fallback;
    if (typeof query[key] !== "string" || !/^\d+$/.test(query[key]))
      throw fail(400, "Invalid " + key);
    const value = Number(query[key]);
    if (!Number.isSafeInteger(value) || value < 1 || value > max)
      throw fail(400, "Invalid " + key);
    return value;
  };
  const page = integer("page", 1, 100000),
    limit = integer("limit", 10, 50);
  const filter = { status: "active" };
  if (query.title !== undefined) {
    if (typeof query.title !== "string" || query.title.length > 120)
      throw fail(400, "Invalid title search");
    filter.title = new RegExp(
      query.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i",
    );
  }
  for (const key of ["priceMin", "priceMax"])
    if (query[key] !== undefined && query[key] !== "") {
      const value = Number(query[key]);
      if (
        typeof query[key] !== "string" ||
        !Number.isSafeInteger(value) ||
        value < 0 ||
        value > 1000000000
      )
        throw fail(400, "Invalid price range");
      filter.price = {
        ...filter.price,
        [key === "priceMin" ? "$gte" : "$lte"]: value,
      };
    }
  if (filter.price && filter.price.$gte > filter.price.$lte)
    throw fail(400, "Minimum exceeds maximum");
  if (query.sort && !["newest", "price-asc", "price-desc"].includes(query.sort))
    throw fail(400, "Invalid sort");
  const sort =
    query.sort === "price-asc"
      ? { price: 1, _id: 1 }
      : query.sort === "price-desc"
        ? { price: -1, _id: 1 }
        : { createdAt: -1, _id: -1 };
  return { filter, sort, page, limit };
};
