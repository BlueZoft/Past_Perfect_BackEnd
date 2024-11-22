
const User = require("../models/User")

const isAuthenticated = async (req, res, next) => {

    
    if (req.headers.authorization) {
        const token = req.headers.authorization.replace("Bearer ", "")
        const user = await User.findOne({ token: token })
        if (user) {
            req.user = user
            next()
        } else {
            return res.status(401).json({ error: "Unauthorized 2" })
        }
    } else {
        return res.status(401).json({ error: "Unauthorized 1" })
    }
}

module.exports = isAuthenticated