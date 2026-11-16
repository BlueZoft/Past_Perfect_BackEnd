const Offer = require("../models/Offer");
const User = require("../models/User");
exports.page = async (filter, sort, page, limit) => {
  if (filter.$text) await Offer.init();
  const relevance = !!sort.searchScore;
  const [result] = await Offer.aggregate([
    { $match: filter },
    ...(relevance ? [{ $set: { searchScore: { $meta: "textScore" } } }] : []),
    {
      $lookup: {
        from: User.collection.name,
        let: { owner: "$owner" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$_id", "$$owner"] },
              suspended: { $ne: true },
            },
          },
          { $project: { "account.username": 1, "account.avatar": 1 } },
        ],
        as: "seller",
      },
    },
    { $unwind: "$seller" },
    { $set: { owner: "$seller" } },
    { $unset: ["seller", "moderationAudit", "orders", "reservation"] },
    { $sort: relevance ? { searchScore: -1, _id: 1 } : sort },
    { $unset: "searchScore" },
    {
      $facet: {
        offers: [{ $skip: (page - 1) * limit }, { $limit: limit }],
        count: [{ $count: "count" }],
      },
    },
  ]);
  return {
    offers: result.offers,
    count: result.count[0]?.count || 0,
    page,
    limit,
  };
};
