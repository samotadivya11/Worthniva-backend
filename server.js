const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;

/*
=========================================================
 WORTHNIVA PRODUCT INTELLIGENCE API
=========================================================

Current role:
- API foundation
- Product/URL validation
- Marketplace detection
- Standardized product responses
- Ready for real product-data providers

IMPORTANT:
This version DOES NOT invent product information.
Real price, rating, review and product data will be
connected through approved/legitimate data sources later.
=========================================================
*/


/*
=========================================================
 SUPPORTED MARKETPLACES
=========================================================
*/

const MARKETPLACES = {
    amazon: {
        name: "Amazon",
        domains: [
            "amazon.in",
            "www.amazon.in",
            "amazon.com",
            "www.amazon.com"
        ]
    },

    flipkart: {
        name: "Flipkart",
        domains: [
            "flipkart.com",
            "www.flipkart.com"
        ]
    },

    myntra: {
        name: "Myntra",
        domains: [
            "myntra.com",
            "www.myntra.com"
        ]
    },

    nykaa: {
        name: "Nykaa",
        domains: [
            "nykaa.com",
            "www.nykaa.com"
        ]
    },

    meesho: {
        name: "Meesho",
        domains: [
            "meesho.com",
            "www.meesho.com"
        ]
    },

    ajio: {
        name: "AJIO",
        domains: [
            "ajio.com",
            "www.ajio.com"
        ]
    }
};


/*
=========================================================
 HELPERS
=========================================================
*/


function cleanText(value) {

    if (typeof value !== "string") {
        return "";
    }

    return value.trim();

}


function isValidUrl(value) {

    try {

        const url = new URL(value);

        return (
            url.protocol === "http:" ||
            url.protocol === "https:"
        );

    } catch {

        return false;

    }

}


function detectMarketplace(value) {

    if (!isValidUrl(value)) {

        return null;

    }

    try {

        const url = new URL(value);

        const hostname =
            url.hostname.toLowerCase();

        for (const [key, marketplace]
            of Object.entries(MARKETPLACES)) {

            if (
                marketplace.domains.includes(hostname)
            ) {

                return {
                    id: key,
                    name: marketplace.name
                };

            }

        }

        return {
            id: "other",
            name: "Other"
        };

    } catch {

        return null;

    }

}


/*
=========================================================
 STANDARD PRODUCT OBJECT
=========================================================
*/

function createEmptyProduct(query) {

    return {

        query,

        marketplace: null,

        name: null,

        url: isValidUrl(query)
            ? query
            : null,

        price: null,

        currency: "INR",

        originalPrice: null,

        discount: null,

        rating: null,

        reviewCount: null,

        image: null,

        availability: null,

        specifications: [],

        source: null

    };

}


/*
=========================================================
 WORTHNIVA ANALYSIS OBJECT
=========================================================
*/

function createPendingAnalysis() {

    return {

        score: null,

        verdict: "Awaiting verified product data",

        valueForMoney: null,

        quality: null,

        reviews: null,

        features: null,

        pros: [],

        cons: [],

        warnings: [],

        summary:
            "WORTHNIVA needs verified product information before giving a final verdict."

    };

}


/*
=========================================================
 HEALTH CHECK
=========================================================
*/

app.get("/", (req, res) => {

    res.json({

        name: "WORTHNIVA",

        status: "online",

        message:
            "WORTHNIVA intelligence engine is running ✦",

        version: "2.0",

        endpoints: {

            checkProduct:
                "POST /api/check-product",

            compareProducts:
                "POST /api/compare-products"

        }

    });

});


/*
=========================================================
 CHECK PRODUCT
=========================================================
*/

app.post("/api/check-product", async (req, res) => {

    try {

        const product =
            cleanText(req.body?.product);


        if (!product) {

            return res.status(400).json({

                success: false,

                error:
                    "Please provide a product name or URL."

            });

        }


        const productData =
            createEmptyProduct(product);


        /*
        -------------------------------------------------
        DETECT MARKETPLACE
        -------------------------------------------------
        */

        if (isValidUrl(product)) {

            const marketplace =
                detectMarketplace(product);

            if (marketplace) {

                productData.marketplace =
                    marketplace;

            }

        }


        /*
        -------------------------------------------------
        CURRENT DATA STATUS
        -------------------------------------------------

        IMPORTANT:
        No fake product information is generated here.

        Real data providers will be connected later.
        -------------------------------------------------
        */


        const result = {

            success: true,

            status: "awaiting_data",

            query: product,

            product: productData,

            worthniva:
                createPendingAnalysis(),

            sources: [],

            nextStep:
                "Connect an approved product-data provider."

        };


        return res.json(result);


    } catch (error) {

        console.error(
            "CHECK PRODUCT ERROR:",
            error
        );


        return res.status(500).json({

            success: false,

            error:
                "Something went wrong while checking the product."

        });

    }

});


/*
=========================================================
 COMPARE PRODUCTS
=========================================================
*/

app.post("/api/compare-products", async (req, res) => {

    try {

        const productA =
            cleanText(req.body?.productA);

        const productB =
            cleanText(req.body?.productB);


        if (!productA || !productB) {

            return res.status(400).json({

                success: false,

                error:
                    "Please provide two products to compare."

            });

        }


        if (productA === productB) {

            return res.status(400).json({

                success: false,

                error:
                    "Please provide two different products."

            });

        }


        const productAData =
            createEmptyProduct(productA);

        const productBData =
            createEmptyProduct(productB);


        /*
        -------------------------------------------------
        MARKETPLACE DETECTION
        -------------------------------------------------
        */

        if (isValidUrl(productA)) {

            productAData.marketplace =
                detectMarketplace(productA);

        }

        if (isValidUrl(productB)) {

            productBData.marketplace =
                detectMarketplace(productB);

        }


        /*
        -------------------------------------------------
        CURRENT COMPARISON STATUS
        -------------------------------------------------

        No winner is invented until verified product
        information is available.
        -------------------------------------------------
        */


        const result = {

            success: true,

            status: "awaiting_data",

            products: [

                {

                    id: "A",

                    ...productAData,

                    score: null

                },

                {

                    id: "B",

                    ...productBData,

                    score: null

                }

            ],

            winner: null,

            comparison: {

                price: null,

                rating: null,

                valueForMoney: null,

                quality: null,

                reviews: null,

                features: null

            },

            summary:
                "WORTHNIVA needs verified product information before choosing a winner.",

            nextStep:
                "Connect approved product-data providers."

        };


        return res.json(result);


    } catch (error) {

        console.error(
            "COMPARE PRODUCTS ERROR:",
            error
        );


        return res.status(500).json({

            success: false,

            error:
                "Something went wrong while comparing products."

        });

    }

});


/*
=========================================================
 UNKNOWN API ROUTE
=========================================================
*/

app.use("/api", (req, res) => {

    res.status(404).json({

        success: false,

        error:
            "WORTHNIVA API endpoint not found."

    });

});


/*
=========================================================
 GLOBAL ERROR HANDLER
=========================================================
*/

app.use((error, req, res, next) => {

    console.error(
        "GLOBAL ERROR:",
        error
    );


    res.status(500).json({

        success: false,

        error:
            "WORTHNIVA encountered an unexpected error."

    });

});


/*
=========================================================
 START SERVER
=========================================================
*/

app.listen(PORT, () => {

    console.log(
        `WORTHNIVA backend running on port ${PORT}`
    );

});
