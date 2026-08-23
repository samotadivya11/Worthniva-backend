const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

/*
=========================================================
WORTHNIVA PRODUCT INTELLIGENCE API
=========================================================

This is the first backend foundation.

Current version:
- Accepts a product name or URL
- Creates a structured WORTHNIVA response
- Provides a clean API for the website

Later we will connect approved/public data sources,
product APIs, price data, review sources and the
WORTHNIVA scoring engine.
=========================================================
*/


app.get("/", (req, res) => {

    res.json({
        name: "WORTHNIVA",
        status: "online",
        message: "WORTHNIVA intelligence engine is running ✦"
    });

});


app.post("/api/check-product", async (req, res) => {

    try {

        const { product } = req.body;

        if (!product || !product.trim()) {

            return res.status(400).json({
                success: false,
                error: "Please provide a product name or URL."
            });

        }

        /*
        -------------------------------------------------
        TEMPORARY PRODUCT OBJECT
        -------------------------------------------------

        This is deliberately structured so that we can
        replace the temporary data with real sources
        without rebuilding the website.
        */

        const result = {

            success: true,

            query: product.trim(),

            product: {
                name: product.trim(),
                price: null,
                currency: "INR",
                rating: null,
                reviewCount: null,
                image: null
            },

            worthniva: {

                score: null,

                verdict: "Awaiting product data",

                valueForMoney: null,
                quality: null,
                reviews: null,
                features: null,

                pros: [],
                cons: [],

                summary:
                    "WORTHNIVA needs verified product information before giving a final verdict."

            },

            sources: []

        };


        res.json(result);

    } catch (error) {

        console.error(error);

        res.status(500).json({

            success: false,

            error: "Something went wrong while checking the product."

        });

    }

});


app.post("/api/compare-products", async (req, res) => {

    try {

        const { productA, productB } = req.body;

        if (!productA || !productB) {

            return res.status(400).json({

                success: false,

                error: "Please provide two products to compare."

            });

        }


        const result = {

            success: true,

            products: [

                {
                    name: productA.trim(),
                    score: null,
                    price: null,
                    rating: null
                },

                {
                    name: productB.trim(),
                    score: null,
                    price: null,
                    rating: null
                }

            ],

            winner: null,

            summary:
                "WORTHNIVA needs verified product information before choosing a winner."

        };


        res.json(result);

    } catch (error) {

        console.error(error);

        res.status(500).json({

            success: false,

            error: "Something went wrong while comparing products."

        });

    }

});


app.listen(PORT, () => {

    console.log(
        `WORTHNIVA backend running on port ${PORT}`
    );

});
