//Import User model
const User = require("../models/User")

const isAuthenticated = async (req, res, next) => {
    //without next(), the request will remain "blocked" in my isAuthenticated function
    //   next();
    // console.log(req.headers.authorization)
    
    if (req.headers.authorization) {
        //continue with the rest of my verifications
        const token = req.headers.authorization.replace("Bearer ", "")
        const user = await User.findOne({ token: token })
        // const user = await User.findOne({ token: token }).select("account _id");
        
        //POSTMAN => Bearer QSDFGH1234
        //DATABASE => QSDFGH1234
        
        if (user) {
            // My token is valid and I can continue
            //Send the user info to the next route
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