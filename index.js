const express = require("express");
const mongoose = require("mongoose");
const formidable = require("express-formidable");
const cors = require("cors");
const app = express();
const port = 3001;
require("dotenv").config();

mongoose.connect(process.env.MONGODB_URI);

// Connection to Cloudinary
const cloudinary = require("cloudinary").v2;
cloudinary.config({
  cloud_name: "pastperfect",
  api_key: process.env.CLOUDINARY_APIKEY,
  api_secret: process.env.CLOUDINARY_APISECRET,
  secure: true,
});

app.use(formidable());
app.use(cors({
  origin: "http://localhost:3000",
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
}));

// Import routes
const usersRoutes = require("./routes/user");
const offersRoutes = require("./routes/offer");
const paymentRoutes = require("./routes/payment");
app.use(usersRoutes);
app.use(offersRoutes);
app.use(paymentRoutes);

app.get("/", (req, res) => {
  res.json("Welcome to the PastPerfect API");
});

app.use((err, req, res, next) => {
  res.json({ error: err.message });
});

app.listen(port, () => console.log(`Server started on port ${port}`));
