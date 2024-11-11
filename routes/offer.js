const express = require("express")
const router = express.Router()
const cloudinary = require("cloudinary").v2
const Offer = require("../models/Offer")
const isAuthenticated = require("../middleware/isAuthenticated")

router.post("/offer/publish", isAuthenticated, async (req, res) => {
	console.log(req.user)
	try {
		const { title, description, price, brand, size, condition, color, city } =
			req.fields

		console.log(
			"req.fields ===>",
			req.fields,
			"req files ===>",
			req.files.picture.path
		)
		if (title && price && req.files.picture.path) {
			const newOffer = new Offer({
				product_name: req.fields.title,
				product_description: description,
				product_price: price,
				product_details: [
					{ BRAND: brand },
					{ SIZE: size },
					{ CONDITION: condition },
					{ COLOR: color },
					{ LOCATION: city },
				],
				owner: req.user,
			})

			// Send image to cloudinary
			// const result = await cloudinary.uploader.unsigned_upload(
			// 	req.files.picture.path,
			// 	"ml_default",
			// 	{
			// 		folder: `api/vinted/offers/${newOffer._id}`,
			// 		// public_id: "preview",
			// 		// public_id: `preview + ${newOffer._id}`,
			// 		public_id: `${newOffer._id}`,
			// 		cloud_name: "manuelf-cloudinary",
			// 	}
			// )

			const result = await cloudinary.uploader.upload(req.files.picture.path, {
				folder: "/vinted/offers",
			})
			// console.log(result);
			newOffer.product_image = result

			// add user
			newOffer.owner = req.user

			await newOffer.save()

			res.json(newOffer)
		} else {
			res.status(400).json({
				message: "title, price and picture are required",
			})
		}
	} catch (error) {
		res.status(400).json({ message: error.message })
	}
})

router.get("/offers", async (req, res) => {
	try {
		const filtersObject = {}

		// Title Management
		if (req.query.title) {
			filtersObject.product_name = new RegExp(req.query.title, "i")
		}

		if (req.query.priceMin) {
			filtersObject.product_price = {
				$gte: req.query.priceMin,
			}
		}

		if (req.query.priceMax) {
			if (filtersObject.product_price) {
				filtersObject.product_price.$lte = req.query.priceMax
			} else {
				filtersObject.product_price = {
					$lte: req.query.priceMax,
				}
			}
		}

		console.log(filtersObject)

		// Sort management with sortObject
		const sortObject = {}
		if (req.query.sort === "price-desc") {
			sortObject.product_price = "desc"
		} else if (req.query.sort === "price-asc") {
			sortObject.product_price = "asc"
		}

		// Pagination management
		// By default we have 5 listings per page
		// If my page equals 1, I should skip 0 listings
		// If my page equals 2, I should skip 5 listings
		// If my page equals 4, I should skip 15 listings

		//(1-1) * 5 = skip 0 results => PAGE 1
		//(2-1) * 5 = SKIP 5 RESULTS => page 2
		//(4-1) * 5 = skip 15 results => page 4
		// let limit = 0
		// limit = Number(req.query.limit)
		let limit = 0
		if (req.query.limit) {
			limit = Number(req.query.limit)
		}
		// let page = 1
		// if (Number(req.query.page) < 1) {
		// 	page = 1
		// } else {
		// 	page = Number(req.query.page)
		// }
		let page = 1
		if (req.query.page) {
			page = req.query.page
		}

		const offers = await Offer.find(filtersObject)
			.populate({
				path: "owner",
				select: "account",
			})
			.sort(sortObject)
			.skip((page - 1) * limit)
			.limit(limit)
		// .select("product_name product_price")

		// this line will return the number of listings found based on the filters
		const count = await Offer.countDocuments(filtersObject)

		res.json({
			count: count,
			offers: offers,
		})
	} catch (error) {
		// My filtersObject will collect the different filters
		console.log(error.message)
		res.status(400).json({ message: error.message })
	}
})

router.get("/offer/:id", async (req, res) => {
	try {
		const offer = await Offer.findById(req.params.id).populate({
			path: "owner",
			select: "account.username account.phone account.avatar",
		})
		res.json(offer)
	} catch (error) {
		console.log(error.message)
		res.status(400).json({ message: error.message })
	}
})

module.exports = router