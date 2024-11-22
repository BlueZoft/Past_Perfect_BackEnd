const express = require("express")
const router = express.Router()
const bcrypt = require("bcrypt");
const cloudinary = require("cloudinary").v2
const uid2 = require("uid2")
const User = require("../models/User")

router.post("/user/signup", async (req, res) => {
    try {
        if (req.fields.username === undefined) {
            res.status(400).json({ message: "Missing parameter" });
        } else {
            const isUserExist = await User.findOne({ email: req.fields.email });
            if (isUserExist !== null) {
                res.status(400).json({ message: "This email already has an account" });
            } else {
                // Step 1: hash the password
                const salt = await bcrypt.genSalt(10);
                const hash = await bcrypt.hash(req.fields.password, salt); // Added await here
                const token = uid2(64);

                // Step 2: create the new user
                const newUser = new User({
                    email: req.fields.email,
                    account: {
                        username: req.fields.username,
                        // avatar: result,
                    },
                    token: token,
                    hash: hash,
                    salt: salt,
                });

                if (req.files.avatar) {
                    const result = await cloudinary.uploader.upload(
                        req.files.avatar.path,
                        {
                            folder: "/vinted/avatars",
                        }
                    );
                    newUser.account.avatar = result;
                }

                // Step 3: save this new user in the database
                await newUser.save();
                res.json({
                    _id: newUser._id,
                    email: newUser.email,
                    token: newUser.token,
                    account: newUser.account,
                });
            }
        }
    } catch (error) {
        console.error("Error during user signup:", error); // Added error logging
        res.status(400).json({ error: error.message });
    }
});

router.post("/user/login", async (req, res) => {
    try {
        const user = await User.findOne({ email: req.fields.email });
        if (user === null) {
            res.status(401).json({ message: "Unauthorized ! 1" });
        } else {
            const isMatch = bcrypt.compare(req.fields.password, user.hash);
            if (isMatch) {
                res.json({
                    _id: user._id,
                    token: user.token,
                    account: user.account,
                });
            } else {
                res.status(401).json({ message: "Unauthorized ! 2" });
            }
        }
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

module.exports = router;