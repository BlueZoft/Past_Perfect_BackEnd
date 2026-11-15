module.exports = (user) => ({
  _id: user._id,
  email: user.email,
  account: user.account,
  suspended: !!user.suspended,
  suspensionReason: user.suspended ? user.suspensionReason : "",
  moderationVersion: user.moderationVersion || 0,
  emailVerified: !!user.emailVerifiedAt,
  avatarVersion: user.avatarVersion || 0,
  isAdmin: require("./admin").isAdmin(user._id),
});
