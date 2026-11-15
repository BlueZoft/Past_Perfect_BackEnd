const { fail } = require("./http");
const { catalogue, validLocation } = require("./catalogue");
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
  const category = body.category === undefined ? "other" : body.category;
  const district = body.district === undefined ? "" : body.district;
  const town = body.town === undefined ? "" : body.town;
  if (
    !catalogue.categories.includes(category) ||
    typeof district !== "string" ||
    typeof town !== "string" ||
    !validLocation(district, town)
  )
    throw fail(400, "Choose a valid category and location");
  if (category !== "clothing" && body.size)
    throw fail(400, "Size is only supported for clothing");
  return {
    category,
    district,
    town,
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
  if (query.category !== undefined) {
    if (!catalogue.categories.includes(query.category))
      throw fail(400, "Invalid category");
    filter.category = query.category;
  }
  if (query.district !== undefined || query.town !== undefined) {
    if (
      typeof (query.district || "") !== "string" ||
      typeof (query.town || "") !== "string" ||
      !validLocation(query.district || "", query.town || "")
    )
      throw fail(400, "Invalid location filter");
    if (query.district) filter.district = query.district;
    if (query.town) filter.town = query.town;
  }
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
