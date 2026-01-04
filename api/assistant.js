const { GoogleGenAI } = require("@google/genai");
const admin = require("firebase-admin");
const cors = require('cors')({ origin: true });

// ---------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------
const ALLOWED_COLLECTIONS = ['orders', 'checkouts'];
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 500; // Increased to 500 for better monthly stats

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
// SYSTEM_INSTRUCTION moved inside handler to ensure fresh timestamps

// ---------------------------------------------------------
// HELPER FUNCTIONS
// ---------------------------------------------------------

/**
 * Apply filters to a Firestore query reference
 * @param {Object} ref - Firestore query reference
 * @param {Array} filters - Array of filter arrays
 * @returns {Object} Modified reference
 */
const applyFilters = (ref, filters) => {
    let queryRef = ref;

    if (filters && Array.isArray(filters)) {
        // Use for...of to ensure sequential reference updates
        for (const [field, op, val] of filters) {
            let queryVal = val;

            // Auto-convert ISO date strings to Date objects for timestamp fields
            if (['createdAt', 'updatedAt'].includes(field) && typeof val === 'string') {
                // Check if it looks like a date (starts with YYYY-MM-DD)
                if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
                    const date = new Date(val);
                    if (!isNaN(date.getTime())) {
                        queryVal = date;
                    }
                }
            }

            queryRef = queryRef.where(field, op, queryVal);
        }
    }
    return queryRef;
};

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
 * perform server-side aggregation (Count, Sum, Average)
 * This is efficient for large datasets (millions of records)
 */
const aggregateFirestore = async ({ collection, filters, aggregationType, field }) => {
    try {
        if (!ALLOWED_COLLECTIONS.includes(collection)) {
            return `Error: Only 'orders' and 'checkouts' collections are supported.`;
        }

        let ref = db.collection(collection);
        ref = applyFilters(ref, filters);

        if (aggregationType === 'count') {
            const snapshot = await ref.count().get();
            return { count: snapshot.data().count };
        }

        // Sum and Average only work on numeric fields
        if (['sum', 'average'].includes(aggregationType)) {
            if (!field) return `Error: 'field' parameter is required for ${aggregationType}.`;

            // Check for known string fields to prevent valid errors
            // if (collection === 'orders' && field === 'totalPrice') { ... } REMOVED strictly to allow number calculation

            const aggField = aggregationType === 'sum'
                ? admin.firestore.AggregateField.sum(field)
                : admin.firestore.AggregateField.average(field);

            const snapshot = await ref.aggregate({ result: aggField }).get();
            return { [aggregationType]: snapshot.data().result || 0 };
        }

        return "Error: Invalid aggregationType. Use 'count', 'sum', or 'average'.";

    } catch (err) {
        // Handle Firestore index errors
        if (err.code === 9 || err.message.toLowerCase().includes('index')) {
            const indexUrl = err.message.match(/https?:\/\/[^\s]+/)?.[0];
            if (indexUrl) {
                return `[INDEX REQUIRED] Create index: ${indexUrl}`;
            }
        }
        console.error('[Firestore] Aggregation error:', err.message);
        return `Error: ${err.message}`;
    }
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
        ref = applyFilters(ref, filters);

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
    functionDeclarations: [
        {
            name: "queryFirestore",
            description: "Query specific documents from 'orders' or 'checkouts'. Use this to VIEW details or when you need string fields.",
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
        },
        {
            name: "aggregateFirestore",
            description: "Perform server-side COUNT, SUM, or AVERAGE. Use this for 'how many', 'total stats', or analyzing large datasets (supports millions of records).",
            parametersJsonSchema: {
                type: "object",
                properties: {
                    collection: {
                        type: "string",
                        enum: ALLOWED_COLLECTIONS,
                        description: "Collection to analyze"
                    },
                    filters: {
                        type: "array",
                        description: "Filters to apply before aggregating"
                    },
                    aggregationType: {
                        type: "string",
                        enum: ["count", "sum", "average"],
                        description: "Type of calculation"
                    },
                    field: {
                        type: "string",
                        description: "Field to sum or average (required for sum/average). MUST be a numeric field."
                    }
                },
                required: ["collection", "aggregationType"]
            }
        }
    ]
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

        // ---------------------------------------------------------
        // DYNAMIC SYSTEM INSTRUCTION
        // ---------------------------------------------------------
        const SYSTEM_INSTRUCTION = `You are an expert E-commerce Assistant. You have access to Orders and Abandoned Checkouts.

📊 **DATA SCHEMA:**

1. **ORDERS** (Collection: "orders")
   - orderNumber (number)
   - customerName, email, phoneNormalized
   - totalPrice (number): e.g. 699.00 ✅ NUMBER! Use this for UNLIMITED server-side math.
   - status (string): "COD", "Paid"
   - address1, city, state, zip
   - createdAt, updatedAt (timestamps)

2. **CHECKOUTS** (Collection: "checkouts")
   - total_price (number): e.g. 699 ✅ NUMBER! Can be summed server-side.
   - eventType (string): "ABANDONED"
   - rtoPredict (string): "high", "low"
   - items, billing_address, etc.

🛠️ **TOOL USAGE STRATEGY:**

1. **aggregateFirestore** (The "Unlimited" Tool):
   - USE FOR: "How many?", "Total revenue?", "Average value?".
   - ADVANTAGE: Zero limit. Calculates on server.

2. **queryFirestore** (The "Viewer" Tool):
   - USE FOR: "Show me order details", "Find a person".
   - LIMITATION: Max 500 documents.

💡 **REVENUE CALCULATION LOGIC:**
- **Standard (Fast/Unlimited)**: Use \`aggregateFirestore\` with \`field: 'totalPrice'\`.
  -> "Calculating total from 15,000 orders..." (Instant)
  
- **Fallback (If numeric field missing)**: Use \`queryFirestore\` (limit 500) and sum manually.
  -> "Calculating from last 500 orders (data not migrated yet)..."

🧠 **SMART EXAMPLES:**

Q: "Total revenue?"
A: Call \`aggregateFirestore\` ({ collection: 'orders', aggregationType: 'sum', field: 'totalPrice' }).
   -> "Total revenue is ₹1,500,000 (from all orders)."

Q: "Sales from Bangalore?"
A: Call \`aggregateFirestore\` ({ collection: 'orders', aggregationType: 'sum', field: 'totalPrice', filters: [['city', '==', 'Bangalore']] }).
   -> "Bangalore sales: ₹200,000."

📅 **DATE INTELLIGENCE:**
Current time: ${new Date().toISOString()}
- "Today": Start of today 00:00 to now.
- "This Month": 1st of month to now.
- Use ISO strings for date filters.

Response Style:
- Professional, concise, data-driven.
- Always use the currency symbol ₹.`;

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

            let functionResult;
            if (functionCall.name === 'queryFirestore') {
                functionResult = await queryFirestore(args);
            } else if (functionCall.name === 'aggregateFirestore') {
                functionResult = await aggregateFirestore(args);
            }

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
