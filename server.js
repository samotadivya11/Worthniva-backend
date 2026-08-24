const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;

const GEMINI_API_KEY =
    process.env.GEMINI_API_KEY;

const GEMINI_MODEL =
    "gemini-3-flash-preview";


/*
=========================================================
 WORTHNIVA PRODUCT INTELLIGENCE API
=========================================================

Current version:
- Product input validation
- Marketplace detection
- Gemini AI analysis
- Structured WORTHNIVA output
- No fake product facts
- API key remains server-side

IMPORTANT:
Gemini is the reasoning layer.

It must NOT invent:
- prices
- ratings
- review counts
- specifications
- availability

Those facts will come from verified data sources later.
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

        const url =
            new URL(value);

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

        const url =
            new URL(value);

        const hostname =
            url.hostname.toLowerCase();

        for (
            const [id, marketplace]
            of Object.entries(MARKETPLACES)
        ) {

            if (
                marketplace.domains.includes(
                    hostname
                )
            ) {

                return {
                    id,
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
 GEMINI AI
=========================================================
*/

async function askGemini(prompt) {

    if (!GEMINI_API_KEY) {

        throw new Error(
            "GEMINI_API_KEY is not configured on the server."
        );

    }


    const endpoint =
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;


    const response =
        await fetch(
            endpoint,
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json",

                    "x-goog-api-key":
                        GEMINI_API_KEY
                },

                body: JSON.stringify({

                    contents: [

                        {
                            parts: [

                                {
                                    text:
                                        prompt
                                }

                            ]
                        }

                    ],

                    generationConfig: {

                        responseMimeType:
                            "application/json"

                    }

                })

            }
        );


    const data =
        await response.json();


    if (!response.ok) {

        console.error(
            "GEMINI API ERROR:",
            data
        );

        throw new Error(
            data?.error?.message ||
            "Gemini API request failed."
        );

    }


    const text =
        data?.candidates?.[0]?.content?.parts?.[0]?.text;


    if (!text) {

        throw new Error(
            "Gemini returned an empty response."
        );

    }


    try {

        return JSON.parse(text);

    } catch {

        console.error(
            "GEMINI INVALID JSON:",
            text
        );

        throw new Error(
            "Gemini returned an invalid analysis response."
        );

    }

}


/*
=========================================================
 WORTHNIVA AI PROMPT
=========================================================
*/

function buildProductAnalysisPrompt(product) {

    return `

You are the WORTHNIVA shopping intelligence engine.

Your job is to analyze ONLY the product information that is
explicitly provided below.

CRITICAL RULES:

1. NEVER invent prices.
2. NEVER invent ratings.
3. NEVER invent review counts.
4. NEVER invent specifications.
5. NEVER claim that you saw reviews that were not provided.
6. If information is missing, use null or an empty array.
7. Do not pretend that a product has been verified.
8. Your recommendation must be based only on supplied facts.
9. If there is not enough information to make a reliable
   recommendation, say so clearly.
10. Do not favor a product because it is an affiliate product.

Return ONLY valid JSON.

The JSON must have exactly this structure:

{
  "score": number or null,
  "verdict": "BUY" or "THINK TWICE" or "SKIP" or "INSUFFICIENT DATA",
  "valueForMoney": number or null,
  "quality": number or null,
  "reviewQuality": number or null,
  "pros": [],
  "cons": [],
  "warnings": [],
  "summary": ""
}

Scoring guidance:

- 90-100 = exceptionally strong evidence
- 80-89 = generally worth considering
- 70-79 = decent but has meaningful caveats
- 60-69 = weak value / significant concerns
- below 60 = generally avoid

BUT:

If there is not enough verified information,
use:

score: null
verdict: "INSUFFICIENT DATA"

Do not manufacture a score.

PRODUCT INFORMATION:

${JSON.stringify(product, null, 2)}

Analyze this information conservatively.
`;

}


/*
=========================================================
 AI PRODUCT ANALYSIS ENDPOINT
=========================================================
*/

app.post(
    "/api/ai/analyze-product",
    async (req, res) => {

        try {

            const product =
                req.body?.product;


            if (
                !product ||
                typeof product !== "object"
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "A product information object is required."

                });

            }


            const prompt =
                buildProductAnalysisPrompt(
                    product
                );


            const analysis =
                await askGemini(prompt);


            return res.json({

                success: true,

                source: "Gemini",

                model: GEMINI_MODEL,

                analysis

            });


        } catch (error) {

            console.error(
                "AI ANALYSIS ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                error:
                    error.message ||
                    "AI analysis failed."

            });

        }

    }
);

/*
=========================================================
 TEMPORARY GEMINI TEST
=========================================================
*/

app.get("/api/ai/test", async (req, res) => {

    try {

        const testProduct = {

            name: "Test Wireless Earbuds",

            price: 999,

            currency: "INR",

            rating: 4.3,

            reviewCount: 1248,

            features: [
                "Bluetooth",
                "Wireless charging case",
                "Noise reduction"
            ],

            reviewSummary:
                "Users generally like the sound and battery life. " +
                "Some users mention occasional connectivity issues."

        };


        const prompt =
            buildProductAnalysisPrompt(
                testProduct
            );


        const analysis =
            await askGemini(prompt);


        return res.json({

            success: true,

            test: true,

            provider: "Gemini",

            model: GEMINI_MODEL,

            analysis

        });


    } catch (error) {

        console.error(
            "GEMINI TEST ERROR:",
            error
        );


        return res.status(500).json({

            success: false,

            test: true,

            error:
                error.message ||
                "Gemini test failed."

        });

    }

});
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

        version: "3.0",

        ai:
            GEMINI_API_KEY
                ? "configured"
                : "not configured",

        endpoints: {

            checkProduct:
                "POST /api/check-product",

            compareProducts:
                "POST /api/compare-products",

            aiAnalyzeProduct:
                "POST /api/ai/analyze-product"

        }

    });

});


/*
=========================================================
 CHECK PRODUCT
=========================================================
*/

app.post(
    "/api/check-product",
    async (req, res) => {

        try {

            const product =
                cleanText(
                    req.body?.product
                );


            if (!product) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Please provide a product name or URL."

                });

            }


            const marketplace =
                isValidUrl(product)
                    ? detectMarketplace(product)
                    : null;


            const productData = {

                query: product,

                marketplace,

                name: null,

                url:
                    isValidUrl(product)
                        ? product
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


            return res.json({

                success: true,

                status:
                    "awaiting_verified_product_data",

                query: product,

                product: productData,

                worthniva: {

                    score: null,

                    verdict:
                        "Awaiting verified product data",

                    valueForMoney: null,

                    quality: null,

                    reviews: null,

                    features: null,

                    pros: [],

                    cons: [],

                    warnings: [],

                    summary:
                        "Verified product information is required before WORTHNIVA can make a reliable recommendation."

                },

                sources: [],

                aiReady: true

            });


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

    }
);


/*
=========================================================
 COMPARE PRODUCTS
=========================================================
*/

app.post(
    "/api/compare-products",
    async (req, res) => {

        try {

            const productA =
                cleanText(
                    req.body?.productA
                );

            const productB =
                cleanText(
                    req.body?.productB
                );


            if (!productA || !productB) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Please provide two products to compare."

                });

            }


            if (
                productA.toLowerCase() ===
                productB.toLowerCase()
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Please provide two different products."

                });

            }


            const dataA = {

                id: "A",

                query: productA,

                url:
                    isValidUrl(productA)
                        ? productA
                        : null,

                marketplace:
                    isValidUrl(productA)
                        ? detectMarketplace(productA)
                        : null,

                name: null,

                price: null,

                rating: null,

                reviewCount: null

            };


            const dataB = {

                id: "B",

                query: productB,

                url:
                    isValidUrl(productB)
                        ? productB
                        : null,

                marketplace:
                    isValidUrl(productB)
                        ? detectMarketplace(productB)
                        : null,

                name: null,

                price: null,

                rating: null,

                reviewCount: null

            };


            return res.json({

                success: true,

                status:
                    "awaiting_verified_product_data",

                products: [

                    dataA,

                    dataB

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
                    "Verified product information is required before WORTHNIVA can choose a winner.",

                aiReady: true

            });


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

    }
);


/*
=========================================================
 UNKNOWN API ROUTE
=========================================================
*/

app.use(
    "/api",
    (req, res) => {

        res.status(404).json({

            success: false,

            error:
                "WORTHNIVA API endpoint not found."

        });

    }
);


/*
=========================================================
 GLOBAL ERROR HANDLER
=========================================================
*/

app.use(
    (error, req, res, next) => {

        console.error(
            "GLOBAL ERROR:",
            error
        );


        res.status(500).json({

            success: false,

            error:
                "WORTHNIVA encountered an unexpected error."

        });

    }
);


/*
=========================================================
 START SERVER
=========================================================
*/

app.listen(
    PORT,
    () => {

        console.log(
            `WORTHNIVA backend running on port ${PORT}`
        );

    }
);
