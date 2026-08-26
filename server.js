const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const GEMINI_MODEL =
    process.env.GEMINI_MODEL || "gemini-2.5-flash";

const GEMINI_URL =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;


/*
=========================================================
 WORTHNIVA PRODUCT INTELLIGENCE API
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

        for (
            const [id, marketplace]
            of Object.entries(MARKETPLACES)
        ) {

            if (
                marketplace.domains.includes(hostname)
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
 PRODUCT OBJECT
=========================================================
*/

function createProduct(query) {

    return {

        query,

        marketplace:
            detectMarketplace(query),

        name: null,

        url:
            isValidUrl(query)
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

        description: null,

        reviews: [],

        source: null

    };

}


/*
=========================================================
 EMPTY ANALYSIS
=========================================================
*/

function emptyAnalysis() {

    return {

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
            "Verified product information is required before WORTHNIVA can provide a final recommendation."

    };

}


/*
=========================================================
 GEMINI AI
=========================================================
*/

async function askGemini(prompt) {

    if (!GEMINI_API_KEY) {

        return {

            success: false,

            error:
                "Gemini API key is not configured on the server."

        };

    }


    try {

        const response =
            await fetch(

                GEMINI_URL +
                `?key=${encodeURIComponent(
                    GEMINI_API_KEY
                )}`,

                {

                    method: "POST",

                    headers: {

                        "Content-Type":
                            "application/json"

                    },

                    body: JSON.stringify({

                        contents: [

                            {

                                role: "user",

                                parts: [

                                    {
                                        text: prompt
                                    }

                                ]

                            }

                        ],

                        generationConfig: {

                            temperature: 0.2,

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
                "Gemini API error:",
                data
            );

            return {

                success: false,

                error:
                    data?.error?.message ||
                    "Gemini request failed."

            };

        }


        const text =
            data?.candidates?.[0]
                ?.content?.parts?.[0]
                ?.text;


        if (!text) {

            return {

                success: false,

                error:
                    "Gemini returned an empty response."

            };

        }


        let parsed;

        try {

            parsed =
                JSON.parse(text);

        } catch (error) {

            console.error(
                "Gemini returned invalid JSON:",
                text
            );

            return {

                success: false,

                error:
                    "Gemini returned an invalid analysis format."

            };

        }


        return {

            success: true,

            data: parsed

        };


    } catch (error) {

        console.error(
            "Gemini connection error:",
            error
        );

        return {

            success: false,

            error:
                "Could not connect to the AI service."

        };

    }

}


/*
=========================================================
 PRODUCT ANALYSIS PROMPT
=========================================================
*/

function buildProductPrompt(product) {

    return `

You are the AI reasoning engine for WORTHNIVA,
an independent shopping intelligence platform.

Analyze ONLY the verified product information supplied below.

CRITICAL RULES:

1. Never invent facts.
2. Never invent prices.
3. Never invent ratings.
4. Never invent review counts.
5. Never invent specifications.
6. Never claim that you personally visited a shopping website.
7. If information is missing, use null or explain that it is unavailable.
8. Base the recommendation only on the supplied evidence.
9. If there is not enough information for a reliable recommendation,
   use verdict "INSUFFICIENT DATA".

Return ONLY valid JSON.

Required structure:

{
  "score": number or null,
  "verdict": "BUY" | "THINK TWICE" | "SKIP" | "INSUFFICIENT DATA",
  "valueForMoney": number or null,
  "quality": number or null,
  "reviews": number or null,
  "features": number or null,
  "pros": [],
  "cons": [],
  "warnings": [],
  "summary": ""
}

Scores must be between 0 and 100.

PRODUCT DATA:

${JSON.stringify(product, null, 2)}

`;

}


/*
=========================================================
 COMPARISON PROMPT
=========================================================
*/

function buildComparisonPrompt(
    productA,
    productB
) {

    return `

You are the comparison engine for WORTHNIVA.

Compare ONLY the verified information supplied below.

CRITICAL RULES:

- Never invent missing information.
- Never assume an unknown price.
- Never assume an unknown rating.
- Never fabricate specifications.
- If the available evidence is insufficient,
  winner must be null.
- Explain the comparison using only supplied facts.

Return ONLY valid JSON.

Required structure:

{
  "winner": "A" | "B" | null,
  "scoreA": number or null,
  "scoreB": number or null,
  "priceComparison": "",
  "qualityComparison": "",
  "reviewComparison": "",
  "featureComparison": "",
  "valueComparison": "",
  "summary": ""
}

Scores must be between 0 and 100.

PRODUCT A:

${JSON.stringify(
    productA,
    null,
    2
)}

PRODUCT B:

${JSON.stringify(
    productB,
    null,
    2
)}

`;

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

        version: "3.1",

        ai: {

            provider:
                "Google Gemini",

            configured:
                Boolean(GEMINI_API_KEY),

            model:
                GEMINI_MODEL

        },

        endpoints: {

            checkProduct:
                "POST /api/check-product",

            compareProducts:
                "POST /api/compare-products",

            analyzeProduct:
                "POST /api/analyze-product-data",

            aiTest:
                "GET /api/ai-test"

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

            const productInput =
                cleanText(
                    req.body?.product
                );


            if (!productInput) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Please provide a product name or URL."

                });

            }


            const product =
                createProduct(
                    productInput
                );


            return res.json({

                success: true,

                status:
                    "awaiting_verified_data",

                query:
                    productInput,

                product,

                worthniva:
                    emptyAnalysis(),

                sources: [],

                ai: {

                    available:
                        Boolean(GEMINI_API_KEY),

                    used: false,

                    reason:
                        "AI analysis requires verified product information."

                }

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
 ANALYZE VERIFIED PRODUCT DATA WITH GEMINI
=========================================================
*/

app.post(
    "/api/analyze-product-data",
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
                        "Verified product data is required."

                });

            }


            if (!GEMINI_API_KEY) {

                return res.status(503).json({

                    success: false,

                    error:
                        "Gemini AI is not configured."

                });

            }


            const prompt =
                buildProductPrompt(
                    product
                );


            const ai =
                await askGemini(
                    prompt
                );


            if (!ai.success) {

                return res.status(502).json({

                    success: false,

                    error:
                        ai.error

                });

            }


            return res.json({

                success: true,

                status:
                    "analyzed",

                product,

                worthniva:
                    ai.data,

                ai: {

                    provider:
                        "Google Gemini",

                    model:
                        GEMINI_MODEL

                }

            });


        } catch (error) {

            console.error(
                "AI ANALYSIS ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                error:
                    "Something went wrong during AI analysis."

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


            const productAData =
                createProduct(productA);

            const productBData =
                createProduct(productB);


            return res.json({

                success: true,

                status:
                    "awaiting_verified_data",

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
                    "Verified product information is required before WORTHNIVA can choose a winner.",

                ai: {

                    available:
                        Boolean(GEMINI_API_KEY),

                    used: false

                }

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
 GET GEMINI TEST
=========================================================

This is ONLY a temporary/simple browser test.

It uses fictional test data.

It does NOT access Amazon, Flipkart, Myntra
or any other shopping website.
=========================================================
*/

app.get(
    "/api/ai-test",
    async (req, res) => {

        try {

            if (!GEMINI_API_KEY) {

                return res.status(503).json({

                    success: false,

                    error:
                        "Gemini API key is not configured."

                });

            }


            const testProduct = {

                name:
                    "WORTHNIVA AI Test Product",

                price:
                    1499,

                currency:
                    "INR",

                originalPrice:
                    2499,

                rating:
                    4.3,

                reviewCount:
                    1250,

                description:
                    "A fictional test product used only to verify the WORTHNIVA Gemini AI pipeline.",

                specifications: [

                    "Test specification 1",

                    "Test specification 2"

                ],

                reviews: [

                    "Comfortable and good quality.",

                    "Looks nice for the price.",

                    "Sizing could be better."

                ]

            };


            const prompt =
                buildProductPrompt(
                    testProduct
                );


            const ai =
                await askGemini(
                    prompt
                );


            if (!ai.success) {

                return res.status(502).json({

                    success: false,

                    error:
                        ai.error

                });

            }


            return res.json({

                success: true,

                message:
                    "WORTHNIVA Gemini AI connection is working ✦",

                product:
                    testProduct,

                worthniva:
                    ai.data,

                ai: {

                    provider:
                        "Google Gemini",

                    model:
                        GEMINI_MODEL

                }

            });


        } catch (error) {

            console.error(
                "GEMINI TEST ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                error:
                    "Gemini connection test failed."

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
=======================     Boolean(GEMINI_API_KEY),

            model:
                GEMINI_MODEL

        },

        endpoints: {

            checkProduct:
                "POST /api/check-product",

            compareProducts:
                "POST /api/compare-products",

            aiTest:
                "POST /api/ai-test"

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

            const productInput =
                cleanText(
                    req.body?.product
                );


            if (!productInput) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Please provide a product name or URL."

                });

            }


            const product =
                createProduct(
                    productInput
                );


            /*
            IMPORTANT:

            At this stage we do not have a verified
            marketplace product-data provider connected.

            Therefore we DO NOT ask Gemini to guess
            product information.
            */


            return res.json({

                success: true,

                status:
                    "awaiting_verified_data",

                query:
                    productInput,

                product,

                worthniva:
                    emptyAnalysis(),

                sources: [],

                ai: {

                    available:
                        Boolean(GEMINI_API_KEY),

                    used: false,

                    reason:
                        "AI analysis requires verified product information."

                }

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
 CHECK PRODUCT WITH SUPPLIED VERIFIED DATA
=========================================================

This endpoint is useful for testing the AI layer.

Later our real marketplace adapters will call the same
analysis function automatically.
=========================================================
*/

app.post(
    "/api/analyze-product-data",
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
                        "Verified product data is required."

                });

            }


            if (!GEMINI_API_KEY) {

                return res.status(503).json({

                    success: false,

                    error:
                        "Gemini AI is not configured."

                });

            }


            const prompt =
                buildProductPrompt(
                    product
                );


            const ai =
                await askGemini(
                    prompt
                );


            if (!ai.success) {

                return res.status(502).json({

                    success: false,

                    error:
                        ai.error

                });

            }


            return res.json({

                success: true,

                status: "analyzed",

                product,

                worthniva:
                    ai.data,

                ai: {

                    provider:
                        "Google Gemini",

                    model:
                        GEMINI_MODEL

                }

            });


        } catch (error) {

            console.error(
                "AI ANALYSIS ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                error:
                    "Something went wrong during AI analysis."

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


            const productAData =
                createProduct(productA);

            const productBData =
                createProduct(productB);


            return res.json({

                success: true,

                status:
                    "awaiting_verified_data",

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
                    "Verified product information is required before WORTHNIVA can choose a winner.",

                ai: {

                    available:
                        Boolean(GEMINI_API_KEY),

                    used: false

                }

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
 AI TEST
=========================================================

This lets us verify Gemini independently before connecting
real marketplace data.

It uses ONLY the information supplied in the request.
=========================================================
*/

app.post(
    "/api/ai-test",
    async (req, res) => {

        try {

            if (!GEMINI_API_KEY) {

                return res.status(503).json({

                    success: false,

                    error:
                        "Gemini API key is not configured."

                });

            }


            const testProduct = {

                name:
                    "WORTHNIVA AI Test Product",

                price:
                    1499,

                currency:
                    "INR",

                originalPrice:
                    2499,

                rating:
                    4.3,

                reviewCount:
                    1250,

                description:
                    "A test product used only to verify the WORTHNIVA AI analysis pipeline.",

                specifications: [

                    "Test specification 1",

                    "Test specification 2"

                ],

                reviews: [

                    "Comfortable and good quality.",

                    "Looks nice for the price.",

                    "Sizing could be better."

                ]

            };


            const ai =
                await askGemini(
                    buildProductPrompt(
                        testProduct
                    )
                );


            if (!ai.success) {

                return res.status(502).json({

                    success: false,

                    error:
                        ai.error

                });

            }


            return res.json({

                success: true,

                message:
                    "WORTHNIVA Gemini AI test successful ✦",

                product:
                    testProduct,

                worthniva:
                    ai.data,

                ai: {

                    provider:
                        "Google Gemini",

                    model:
                        GEMINI_MODEL

                }

            });


        } catch (error) {

            console.error(
                "AI TEST ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                error:
                    "WORTHNIVA AI test failed."

            });

        }

    }
);

/*
=========================================================
 TEMPORARY GEMINI CONNECTION TEST
=========================================================
*/

app.get("/api/ai-test", async (req, res) => {

    try {

        if (!GEMINI_API_KEY) {

            return res.status(503).json({

                success: false,

                error:
                    "Gemini API key is not configured."

            });

        }


        const testProduct = {

            name: "WORTHNIVA AI Test Product",

            price: 1499,

            currency: "INR",

            originalPrice: 2499,

            rating: 4.3,

            reviewCount: 1250,

            description:
                "This is a fictional test product used only to verify the WORTHNIVA Gemini AI connection.",

            specifications: [
                "Test specification 1",
                "Test specification 2"
            ],

            reviews: [
                "Comfortable and good quality.",
                "Looks nice for the price.",
                "Sizing could be better."
            ]

        };


        const ai = await askGemini(
            buildProductPrompt(testProduct)
        );


        if (!ai.success) {

            return res.status(502).json({

                success: false,

                error: ai.error

            });

        }


        return res.json({

            success: true,

            message:
                "WORTHNIVA Gemini AI connection is working ✦",

            product:
                testProduct,

            worthniva:
                ai.data,

            ai: {

                provider:
                    "Google Gemini",

                model:
                    GEMINI_MODEL

            }

        });


    } catch (error) {

        console.error(
            "GEMINI TEST ERROR:",
            error
        );


        return res.status(500).json({

            success: false,

            error:
                "Gemini connection test failed."

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
