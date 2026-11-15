module.exports = (user) => ({
  _id: user._id,
  email: user.email,
  account: user.account,
  emailVerified: !!user.emailVerifiedAt,
  avatarVersion: user.avatarVersion || 0,
  isAdmin: require("./admin").isAdmin(user._id),
});
