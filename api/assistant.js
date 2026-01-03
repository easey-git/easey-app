const { GoogleGenAI } = require("@google/genai");
const admin = require("firebase-admin");
const cors = require('cors')({ origin: true });

// ---------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------
const ALLOWED_COLLECTIONS = ['orders', 'checkouts'];
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100; // Prevent excessive queries

// ---------------------------------------------------------
// INITIALIZATION
// ---------------------------------------------------------
if (!admin.apps.length) {
    try {
        const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
            ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
            : {};

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } catch (error) {
        console.error('[Firebase] Initialization error:', error.message);
    }
}
const db = admin.firestore();

// Initialize Gemini AI
let ai;
try {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY environment variable is required');
    }
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
} catch (error) {
    console.error('[Gemini] Initialization error:', error.message);
}

// ---------------------------------------------------------
// SYSTEM INSTRUCTION
// ---------------------------------------------------------
const SYSTEM_INSTRUCTION = `You are an expert E-commerce Assistant focused EXCLUSIVELY on Orders and Abandoned Checkouts.
You have access to exactly TWO Firestore collections. Answer questions ONLY about these.

1. **ORDERS** (Collection: "orders")
   - orderNumber (number): e.g. 1611
   - customerName (string): e.g. "Pushpanjali ."
   - email, phone, phoneNormalized (strings)
   - totalPrice (string): e.g. "699.00" ⚠️ STORED AS STRING
   - status (string): "COD", "Paid"
   - items (array): [{ name, price (string), quantity (number) }]
   - address1, city, state, zip (strings)
   - createdAt, updatedAt (timestamps)

2. **CHECKOUTS** (Collection: "checkouts")
   - cart_id (string)
   - eventType (string): "ABANDONED"
   - first_name, last_name, email, phone_number, phoneNormalized (strings)
   - total_price (number): e.g. 699 ⚠️ STORED AS NUMBER
   - items (array): [{ name, title, price (number), quantity, product_id, variant_id }]
   - billing_address, shipping_address (maps)
   - latest_stage (string): "ORDER_SCREEN", "PHONE_RECEIVED"
   - rtoPredict (string): "high", "low"
   - updatedAt (timestamp)

SEARCH RULES:
- Find by order number: filters=[['orderNumber', '==', 1611]] (NUMBER)
- Find by name: filters=[['customerName', '>=', 'Push'], ['customerName', '<=', 'Push\\uf8ff']]
- Recent orders: orderBy=['createdAt', 'desc'], limit=10
- By status: filters=[['status', '==', 'COD']]
- By city: filters=[['city', '==', 'Bangalore']]
- Abandoned carts: filters=[['eventType', '==', 'ABANDONED']]
- Date ranges: filters=[['createdAt', '>=', 'YYYY-MM-DDTHH:mm:ss'], ['createdAt', '<=', 'YYYY-MM-DDTHH:mm:ss']]

IMPORTANT: Default limit is 10. For "all orders" or large queries, use limit up to 100.`;

// ---------------------------------------------------------
// HELPER FUNCTIONS
// ---------------------------------------------------------

/**
 * Convert Firestore Timestamp objects to ISO strings
 * @param {Object} data - Document data
 * @returns {Object} Data with converted timestamps
 */
const convertTimestamps = (data) => {
    const converted = { ...data };
    Object.keys(converted).forEach(key => {
        const val = converted[key];
        if (val && typeof val === 'object' && val._seconds) {
            converted[key] = new Date(val._seconds * 1000).toISOString();
        } else if (val && val.toDate && typeof val.toDate === 'function') {
            converted[key] = val.toDate().toISOString();
        }
    });
    return converted;
};

/**
 * Query Firestore with validation and error handling
 * @param {Object} params - Query parameters
 * @returns {Promise<Array|string>} Query results or error message
 */
const queryFirestore = async ({ collection, filters, limit, orderBy }) => {
    try {
        // Validate collection
        if (!ALLOWED_COLLECTIONS.includes(collection)) {
            return `Error: Only 'orders' and 'checkouts' collections are supported.`;
        }

        let ref = db.collection(collection);

        // Apply filters
        if (filters && Array.isArray(filters)) {
            filters.forEach(([field, op, val]) => {
                ref = ref.where(field, op, val);
            });
        }

        // Apply sorting
        if (orderBy && orderBy.length > 0) {
            ref = ref.orderBy(orderBy[0], orderBy[1] || 'desc');
        }

        // Apply limit with max cap
        const queryLimit = Math.min(limit || DEFAULT_LIMIT, MAX_LIMIT);
        ref = ref.limit(queryLimit);

        // Execute query
        const snapshot = await ref.get();

        if (snapshot.empty) {
            return "No documents found.";
        }

        // Map results and convert timestamps
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...convertTimestamps(doc.data())
        }));

    } catch (err) {
        // Handle Firestore index errors
        if (err.code === 9 || err.message.toLowerCase().includes('index')) {
            const indexUrl = err.message.match(/https?:\/\/[^\s]+/)?.[0];
            if (indexUrl) {
                return `[INDEX REQUIRED] Create index: ${indexUrl}`;
            }
        }
        console.error('[Firestore] Query error:', err.message);
        return `Error: ${err.message}`;
    }
};

/**
 * Run Express middleware in serverless environment
 */
const runMiddleware = (req, res, fn) => {
    return new Promise((resolve, reject) => {
        fn(req, res, (result) => {
            if (result instanceof Error) return reject(result);
            return resolve(result);
        });
    });
};

// ---------------------------------------------------------
// TOOL DEFINITIONS
// ---------------------------------------------------------
const TOOLS = [{
    functionDeclarations: [{
        name: "queryFirestore",
        description: "Query 'orders' or 'checkouts' collections from Firestore database.",
        parametersJsonSchema: {
            type: "object",
            properties: {
                collection: {
                    type: "string",
                    enum: ALLOWED_COLLECTIONS,
                    description: "Collection to query: 'orders' or 'checkouts'"
                },
                filters: {
                    type: "array",
                    description: "Array of [field, operator, value] filters. Operators: '==', '>=', '<=', '>', '<', 'array-contains'",
                    items: {
                        type: "array",
                        items: { type: "string" }
                    }
                },
                limit: {
                    type: "number",
                    description: `Number of documents to return (default: ${DEFAULT_LIMIT}, max: ${MAX_LIMIT})`
                },
                orderBy: {
                    type: "array",
                    description: "Sort order: [field, direction]. Direction: 'asc' or 'desc'",
                    items: { type: "string" }
                }
            },
            required: ["collection"]
        }
    }]
}];

// ---------------------------------------------------------
// MAIN HANDLER
// ---------------------------------------------------------
module.exports = async (req, res) => {
    // Handle CORS
    await runMiddleware(req, res, cors);

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Validate AI initialization
    if (!ai) {
        return res.status(500).json({
            error: 'AI service not initialized',
            details: 'GEMINI_API_KEY is missing or invalid'
        });
    }

    try {
        const { prompt, history = [] } = req.body;

        // Validate input
        if (!prompt || typeof prompt !== 'string') {
            return res.status(400).json({
                error: 'Invalid request',
                details: 'Prompt is required and must be a string'
            });
        }

        // Build conversation contents
        const contents = [
            // Add conversation history
            ...history.map(msg => ({
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: msg.content }]
            })),
            // Add current prompt
            {
                role: 'user',
                parts: [{ text: prompt }]
            }
        ];

        // Initial AI request
        let response = await ai.models.generateContent({
            model: 'gemini-2.0-flash-exp',
            contents,
            config: {
                systemInstruction: SYSTEM_INSTRUCTION,
                tools: TOOLS
            }
        });

        // Handle function calls
        if (response.functionCalls && response.functionCalls.length > 0) {
            const functionCall = response.functionCalls[0];

            // Extract arguments (SDK may use 'args' or 'arguments')
            const args = functionCall.args || functionCall.arguments || {};

            // Execute function
            const functionResult = await queryFirestore(args);

            // Add function call to conversation
            contents.push({
                role: 'model',
                parts: [{
                    functionCall: {
                        name: functionCall.name,
                        args
                    }
                }]
            });

            // Add function response to conversation
            contents.push({
                role: 'user',
                parts: [{
                    functionResponse: {
                        name: functionCall.name,
                        response: { result: functionResult }
                    }
                }]
            });

            // Get final response with function results
            response = await ai.models.generateContent({
                model: 'gemini-2.0-flash-exp',
                contents,
                config: {
                    systemInstruction: SYSTEM_INSTRUCTION
                }
            });
        }

        return res.status(200).json({ text: response.text });

    } catch (error) {
        console.error('[Assistant] Error:', error.message);
        return res.status(500).json({
            error: 'Internal Server Error',
            details: error.message
        });
    }
};
