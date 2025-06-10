const express = require("express")
const router = express.Router()
const cloudinary = require("cloudinary").v2
const Offer = require("../models/Offer")
const isAuthenticated = require("../middleware/isAuthenticated")

router.post("/offer/publish", isAuthenticated, async (req, res) => {
    try {
        const { title, description, price, size, condition } = req.fields;

        if (title && price && req.files["picture1"].path) {
            const newOffer = new Offer({
                product_name: title,
                product_description: description,
                product_price: price,
                product_details: [
                    { SIZE: size },
                    { CONDITION: condition },
                ],
                owner: req.user,
            });

            // Upload images to Cloudinary
            const imageUrls = [];
            for (let i = 1; i <= 3; i++) {
                const pictureField = `picture${i}`;
                if (req.files[pictureField]) {
                    const result = await cloudinary.uploader.upload(req.files[pictureField].path, {
                        folder: "/vinted/offers",
                    });
                    imageUrls.push({ url: result.secure_url });
                }
            }
            newOffer.product_images = imageUrls;

            // Save the new offer
            await newOffer.save();

            res.json(newOffer);
        } else {
            res.status(400).json({
                message: "title, price and at least one picture are required",
            });
        }
    } catch (error) {
        console.log(error.message);
        res.status(400).json({ message: error.message });
    }
})

router.get("/offers", async (req, res) => {
    try {
        const filtersObject = {};

        // Title Management
        if (req.query.title) {
            filtersObject.product_name = new RegExp(req.query.title, "i");
        }

        if (req.query.priceMin) {
            filtersObject.product_price = {
                $gte: req.query.priceMin,
            };
        }

        if (req.query.priceMax) {
            if (filtersObject.product_price) {
                filtersObject.product_price.$lte = req.query.priceMax;
            } else {
                filtersObject.product_price = {
                    $lte: req.query.priceMax,
                };
            }
        }

        console.log(filtersObject);

        // Sort management with sortObject
        const sortObject = {};
        if (req.query.sort === "price-desc") {
            sortObject.product_price = "desc";
        } else if (req.query.sort === "price-asc") {
            sortObject.product_price = "asc";
        }

        let limit = 0;
        if (req.query.limit) {
            limit = Number(req.query.limit);
        }

        let page = 1;
        if (req.query.page) {
            page = Number(req.query.page);
        }

        const offers = await Offer.find(filtersObject)
            .populate({
                path: "owner",
                select: "account",
            })
            .sort(sortObject)
            .skip((page - 1) * limit)
            .limit(limit);

        // this line will return the number of listings found based on the filters
        const count = await Offer.countDocuments(filtersObject);

        res.json({
            count: count,
            offers: offers,
        });
    } catch (error) {
        console.log(error.message);
        res.status(400).json({ message: error.message });
    }
});

router.get("/offer/:id", async (req, res) => {
    try {
        const offer = await Offer.findById(req.params.id).populate({
            path: "owner",
            select: "account.username account.phone account.avatar",
        });
        if (offer) {
            res.json(offer);
        } else {
            res.status(404).json({ message: "Offer not found" });
        }
    } catch (error) {
        console.log(error.message);
        res.status(400).json({ message: error.message });
    }
});

module.exports = router