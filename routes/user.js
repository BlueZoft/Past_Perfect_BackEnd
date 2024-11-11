const express = require("express")
const router = express.Router()

const cloudinary = require("cloudinary").v2

const SHA256 = require("crypto-js/sha256")
const encBase64 = require("crypto-js/enc-base64")
const uid2 = require("uid2")

const User = require("../models/User")

router.post("/user/signup", async (req, res) => {
	try {
		//check that a username is provided

		if (req.fields.username === undefined) {
			res.status(400).json({ message: "Missing parameter" })
		} else {
			// We verify that the email is available in the database
			const isUserExist = await User.findOne({ email: req.fields.email })
			if (isUserExist !== null) {
				res.status(400).json({ message: "This email already has an account" })
			} else {
				console.log("req.fields AND req.files ==== >", req.fields)
				if (req.files.avatar) {
					console.log("req.files ==== >", req.files.avatar.path)
				}

				// Step 1: hash the password
				const salt = uid2(64)
				const hash = SHA256(req.fields.password + salt).toString(encBase64)
				const token = uid2(64)
				//   console.log("salt==>", salt);
				//   console.log("hash==>", hash);

				// Step 2: create the new user
				const newUser = new User({
					email: req.fields.email,
					account: {
						username: req.fields.username,
						phone: req.fields.phone,
						// avatar: result,
					},
					newsletter: req.fields.newsletter,
					token: token,
					hash: hash,
					salt: salt,
				})
				if (req.files.avatar) {
					const result = await cloudinary.uploader.upload(
						req.files.avatar.path,
						{
							folder: "/vinted/avatars",
						}
					)
					// console.log(result);
					newUser.account.avatar = result
				}

				// Step 3: save this new user in the database
				await newUser.save()
				res.json({
					_id: newUser._id,
					email: newUser.email,
					token: newUser.token,
					account: newUser.account,
					// avatar: newUser.avatar,
				})
			}
		}
	} catch (error) {
		// console.log("heloooo")
		res.status(400).json({ error: error.message })
	}
})

router.post("/user/login", async (req, res) => {
	try {
		const user = await User.findOne({ email: req.fields.email })
		if (user === null) {
			res.status(401).json({ message: "Unauthorized ! 1" })
		} else {
			console.log(user.hash, "hash to compare")
			const newHash = SHA256(req.fields.password + user.salt).toString(
				encBase64
			)
			console.log(newHash, "My new hash")
			if (user.hash === newHash) {
				res.json({
					_id: user._id,
					token: user.token,
					account: user.account,
				})
			} else {
				res.status(401).json({ message: "Unauthorized ! 2" })
			}
		}
	} catch (error) {
		res.status(400).json({ error: error.message })
	}
})

module.exports = router