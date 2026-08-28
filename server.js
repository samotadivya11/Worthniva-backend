const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const GEMINI_MODEL =
    process.env.GEMINI_MODEL || "gemini-3.6-flash";

const GEMINI_URL =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;


/* =========================================================
   SUPPORTED MARKETPLACES
========================================================= */

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


/* =========================================================
   HELPERS
========================================================= */

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

        const hostname =
            new URL(value).hostname.toLowerCase();

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


/* =========================================================
   PRODUCT OBJECT
========================================================= */

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


/* =========================================================
   EMPTY ANALYSIS
========================================================= */

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


/* =========================================================
   GEMINI REQUEST
========================================================= */

async function askGemini(
    prompt,
    useUrlContext = false
) {

    if (!GEMINI_API_KEY) {

        return {

            success: false,

            error:
                "Gemini API key is not configured on the server."

        };

    }


    try {

        const requestBody = {

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

                responseMimeType:
                    "application/json"

            }

        };


        /*
        URL Context is enabled only when requested.
        Gemini uses the URL supplied in the prompt.
        */

        if (useUrlContext) {

            requestBody.tools = [

                {
                    url_context: {}
                }

            ];

        }


        const response =
            await fetch(

                GEMINI_URL,

                {

                    method: "POST",

                    headers: {

                        "Content-Type":
                            "application/json",

                        "x-goog-api-key":
                            GEMINI_API_KEY

                    },

                    body:
                        JSON.stringify(
                            requestBody
                        )

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

        } catch {

            console.error(
                "Gemini returned invalid JSON:",
                text
            );

            return {

                success: false,

                error:
                    "Gemini returned an invalid JSON response."

            };

        }


        return {

            success: true,

            data: parsed,

            urlContextMetadata:
                data?.candidates?.[0]
                    ?.urlContextMetadata || null

        };


    } catch (error) {

        console.error(
            "Gemini connection error:",
            error
        );

        return {

            success: false,

            error:
                "Could not connect to the Gemini service."

        };

    }

}


/* =========================================================
   PRODUCT ANALYSIS PROMPT
========================================================= */

function buildProductPrompt(product) {

    return `

You are WORTHNIVA's product intelligence engine.

Analyze ONLY the verified product information supplied below.

RULES:

1. Never invent facts.
2. Never invent prices.
3. Never invent ratings.
4. Never invent review counts.
5. Never invent specifications.
6. Never claim that you personally visited a shopping website.
7. Missing information must remain null.
8. Base the recommendation only on available evidence.
9. If evidence is insufficient, use "INSUFFICIENT DATA".
10. Do not treat promotional claims as independently verified facts.
11. Clearly distinguish between product-page information and your analysis.

Return ONLY valid JSON.

Use exactly this structure:

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

All scores must be between 0 and 100.

VERIFIED PRODUCT INFORMATION:

${JSON.stringify(product, null, 2)}

`;

}


/* =========================================================
   URL PRODUCT ANALYSIS PROMPT
========================================================= */

function buildUrlProductPrompt(url) {

    return `

You are WORTHNIVA's product-data extraction and intelligence engine.

You have been given ONE publicly accessible product URL.

PRODUCT URL:

${url}

Use the URL Context tool to retrieve and inspect this exact page.

IMPORTANT RULES:

1. Extract information ONLY from the supplied product page.
2. Never invent product information.
3. Never guess a missing price.
4. Never guess a missing rating.
5. Never guess a missing review count.
6. Never guess specifications.
7. If a field is unavailable, return null.
8. Do not use unrelated websites.
9. Do not claim that information is verified if it was not present on the page.
10. Preserve the original product URL.
11. Identify the marketplace from the URL.
12. Extract as much relevant product information as the page provides.
13. Then analyze the product using only the extracted information.
14. If there is insufficient evidence for a reliable recommendation, use "INSUFFICIENT DATA".

Return ONLY valid JSON.

Use exactly this structure:

{
  "product": {
    "name": null,
    "brand": null,
    "url": "${url}",
    "marketplace": null,
    "price": null,
    "currency": "INR",
    "originalPrice": null,
    "discount": null,
    "rating": null,
    "reviewCount": null,
    "image": null,
    "availability": null,
    "description": null,
    "specifications": [],
    "reviews": []
  },

  "worthniva": {
    "score": null,
    "verdict": "BUY",
    "valueForMoney": null,
    "quality": null,
    "reviews": null,
    "features": null,
    "pros": [],
    "cons": [],
    "warnings": [],
    "summary": ""
  }
}

VERDICT MUST BE ONE OF:

"BUY"

"THINK TWICE"

"SKIP"

"INSUFFICIENT DATA"

Scores must be between 0 and 100.

`;

}


/* =========================================================
   COMPARISON PROMPT
========================================================= */

function buildComparisonPrompt(
    productA,
    productB
) {

    return `

You are WORTHNIVA's product comparison engine.

Compare ONLY the verified information supplied below.

RULES:

1. Never invent missing information.
2. Never assume an unknown price.
3. Never assume an unknown rating.
4. Never fabricate specifications.
5. If evidence is insufficient, winner must be null.

Return ONLY valid JSON.

Use exactly this structure:

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

PRODUCT A:

${JSON.stringify(productA, null, 2)}

PRODUCT B:

${JSON.stringify(productB, null, 2)}

`;

}


/* =========================================================
   HEALTH CHECK
========================================================= */

app.get("/", (req, res) => {

    res.json({

        name: "WORTHNIVA",

        status: "online",

        message:
            "WORTHNIVA intelligence engine is running ✦",

        version: "4.0",

        ai: {

            provider:
                "Google Gemini",

            configured:
                Boolean(GEMINI_API_KEY),

            model:
                GEMINI_MODEL,

            urlContext:
                true

        },

        endpoints: {

            checkProduct:
                "POST /api/check-product",

            checkProductUrl:
                "POST /api/check-product-url",

            compareProducts:
                "POST /api/compare-products",

            analyzeProduct:
                "POST /api/analyze-product-data",

            aiTest:
                "GET /api/ai-test"

        }

    });

});


/* =========================================================
   BASIC CHECK PRODUCT
========================================================= */

app.post(
    "/api/check-product",
    async (req, res) => {

        try {

            const input =
                cleanText(
                    req.body?.product
                );


            if (!input) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Please provide a product name or URL."

                });

            }


            /*
            If the user supplied a URL,
            automatically use the real URL analysis route.
            */

            if (isValidUrl(input)) {

                return await analyzeProductUrl(
                    input,
                    res
                );

            }


            const product =
                createProduct(input);


            return res.json({

                success: true,

                status:
                    "awaiting_verified_data",

                query:
                    input,

                product,

                worthniva:
                    emptyAnalysis(),

                sources: [],

                ai: {

                    available:
                        Boolean(GEMINI_API_KEY),

                    used: false,

                    reason:
                        "A product name requires verified product data before analysis."

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


/* =========================================================
   REAL PRODUCT URL ANALYSIS
========================================================= */

async function analyzeProductUrl(
    url,
    res
) {

    if (!isValidUrl(url)) {

        return res.status(400).json({

            success: false,

            error:
                "Please provide a valid public product URL."

        });

    }


    if (!GEMINI_API_KEY) {

        return res.status(503).json({

            success: false,

            error:
                "Gemini AI is not configured."

        });

    }


    const marketplace =
        detectMarketplace(url);


    const ai =
        await askGemini(
            buildUrlProductPrompt(url),
            true
        );


    if (!ai.success) {

        return res.status(502).json({

            success: false,

            error:
                ai.error

        });

    }


    const result =
        ai.data;


    /*
    Preserve marketplace and URL from our own
    trusted input instead of allowing the model
    to replace them.
    */

    if (!result.product) {

        result.product = {};

    }


    result.product.url = url;

    result.product.marketplace =
        marketplace;


    return res.json({

        success: true,

        status:
            "analyzed",

        query:
            url,

        product:
            result.product,

        worthniva:
            result.worthniva ||
            emptyAnalysis(),

        sources: [

            {
                url,
                type: "url_context"
            }

        ],

        affiliate: {

            originalUrl:
                url,

            marketplace:
                marketplace

        },

        ai: {

            provider:
                "Google Gemini",

            model:
                GEMINI_MODEL,

            urlContext:
                true,

            urlContextMetadata:
                ai.urlContextMetadata

        }

    });

}


/* =========================================================
   DIRECT PRODUCT URL ENDPOINT
========================================================= */

app.post(
    "/api/check-product-url",
    async (req, res) => {

        try {

            const url =
                cleanText(
                    req.body?.url
                );


            if (!url) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Please provide a product URL."

                });

            }


            return await analyzeProductUrl(
                url,
                res
            );


        } catch (error) {

            console.error(
                "PRODUCT URL ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                error:
                    "Something went wrong while analyzing the product URL."

            });

        }

    }
);


/* =========================================================
   ANALYZE VERIFIED PRODUCT DATA
========================================================= */

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


            const ai =
                await askGemini(
                    buildProductPrompt(product)
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
                "ANALYSIS ERROR:",
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


/* =========================================================
   COMPARE PRODUCTS
========================================================= */

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

                success:         name: "Flipkart",
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


/* =========================================================
   HELPERS
========================================================= */

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

        const hostname =
            new URL(value).hostname.toLowerCase();

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


/* =========================================================
   PRODUCT OBJECT
========================================================= */

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


/* =========================================================
   EMPTY ANALYSIS
========================================================= */

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


/* =========================================================
   GEMINI REQUEST
========================================================= */

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

        } catch {

            console.error(
                "Invalid Gemini JSON:",
                text
            );

            return {

                success: false,

                error:
                    "Gemini returned an invalid JSON response."

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
                "Could not connect to the Gemini service."

        };

    }

}


/* =========================================================
   PRODUCT ANALYSIS PROMPT
========================================================= */

function buildProductPrompt(product) {

    return `

You are WORTHNIVA's product intelligence engine.

Analyze ONLY the verified product information supplied below.

RULES:

1. Never invent facts.
2. Never invent prices.
3. Never invent ratings.
4. Never invent review counts.
5. Never invent specifications.
6. Never claim that you personally visited a shopping website.
7. Missing information must remain null or be described as unavailable.
8. Base the recommendation only on supplied evidence.
9. If there is insufficient evidence, use "INSUFFICIENT DATA".

Return ONLY valid JSON.

Use exactly this structure:

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

All scores must be between 0 and 100.

VERIFIED PRODUCT INFORMATION:

${JSON.stringify(product, null, 2)}

`;

}


/* =========================================================
   COMPARISON PROMPT
========================================================= */

function buildComparisonPrompt(
    productA,
    productB
) {

    return `

You are WORTHNIVA's product comparison engine.

Compare ONLY the verified information supplied below.

RULES:

1. Never invent missing information.
2. Never assume an unknown price.
3. Never assume an unknown rating.
4. Never fabricate specifications.
5. If there is insufficient evidence, winner must be null.

Return ONLY valid JSON.

Use exactly this structure:

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

PRODUCT A:

${JSON.stringify(productA, null, 2)}

PRODUCT B:

${JSON.stringify(productB, null, 2)}

`;

}


/* =========================================================
   HEALTH CHECK
========================================================= */

app.get("/", (req, res) => {

    res.json({

        name: "WORTHNIVA",

        status: "online",

        message:
            "WORTHNIVA intelligence engine is running ✦",

        version: "3.2",

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


/* =========================================================
   CHECK PRODUCT
========================================================= */

app.post(
    "/api/check-product",
    async (req, res) => {

        try {

            const input =
                cleanText(
                    req.body?.product
                );


            if (!input) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Please provide a product name or URL."

                });

            }


            const product =
                createProduct(input);


            return res.json({

                success: true,

                status:
                    "awaiting_verified_data",

                query:
                    input,

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


/* =========================================================
   ANALYZE VERIFIED PRODUCT DATA
========================================================= */

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


            const ai =
                await askGemini(
                    buildProductPrompt(product)
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
                "ANALYSIS ERROR:",
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


/* =========================================================
   COMPARE PRODUCTS
========================================================= */

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
                "COMPARE ERROR:",
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


/* =========================================================
   GEMINI TEST
========================================================= */

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
                    "A fictional test product used only to test the WORTHNIVA AI pipeline.",

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
                "AI TEST ERROR:",
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


/* =========================================================
   UNKNOWN API ROUTE
========================================================= */

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


/* =========================================================
   GLOBAL ERROR HANDLER
========================================================= */

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


/* =========================================================
   START SERVER
========================================================= */

app.listen(
    PORT,
    () => {

        console.log(
            `WORTHNIVA backend running on port ${PORT}`
        );

        console.log(
            `Gemini configured: ${
                Boolean(GEMINI_API_KEY)
            }`
        );

        console.log(
            `Gemini model: ${GEMINI_MODEL}`
        );

    }
);
