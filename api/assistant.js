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

📊 **DATA SCHEMA:**

1. **ORDERS** (Collection: "orders")
   - orderNumber (number): e.g. 1611
   - customerName (string): e.g. "Pushpanjali ."
   - email, phone, phoneNormalized (strings)
   - totalPrice (string): e.g. "699.00" ⚠️ STORED AS STRING - convert to number for calculations
   - status (string): "COD", "Paid", "CANCELLED"
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

🔍 **SEARCH PATTERNS:**

Basic Queries:
- Find by order number: filters=[['orderNumber', '==', 1611]] (NUMBER, not string)
- Find by customer name: filters=[['customerName', '>=', 'Push'], ['customerName', '<=', 'Push\\uf8ff']]
- Recent orders: orderBy=['createdAt', 'desc'], limit=10
- By status: filters=[['status', '==', 'COD']]
- By city: filters=[['city', '==', 'Bangalore']] (case-sensitive)
- Abandoned carts: filters=[['eventType', '==', 'ABANDONED']]
- High RTO risk: filters=[['rtoPredict', '==', 'high']]

📅 **DATE INTELLIGENCE:**

Current date/time: ${new Date().toISOString()}
Current date (India): ${new Date().toLocaleDateString('en-IN')}

Date Query Examples:
- "Today": filters=[['createdAt', '>=', '${new Date().toISOString().split('T')[0]}T00:00:00'], ['createdAt', '<=', '${new Date().toISOString().split('T')[0]}T23:59:59']]
- "Yesterday": Calculate date as (today - 1 day), use same pattern
- "This week": Last 7 days from today
- "This month": First day of current month to today
- "Last month": First day to last day of previous month

Always use ISO format: 'YYYY-MM-DDTHH:mm:ss' for timestamp queries.

🧮 **CALCULATION ABILITIES:**

When asked for totals, averages, or counts:
1. Query the data (use appropriate limit, max 100)
2. Parse the results and calculate:
   - **Total Revenue**: Sum all totalPrice values (convert string to number: parseFloat(totalPrice))
   - **Average Order Value**: Total revenue / number of orders
   - **Count**: Number of documents returned
3. Present results clearly with currency symbol (₹)

Examples:
- "What's total revenue from COD orders?" 
  → Query COD orders, sum totalPrice, respond: "Total revenue from 45 COD orders: ₹31,500"
- "Average order value today?"
  → Query today's orders, calculate sum/count, respond: "Average: ₹699 (from 12 orders)"
- "How many abandoned carts?"
  → Query checkouts with eventType='ABANDONED', respond: "15 abandoned carts"

🎯 **SMART SEARCH TIPS:**

1. **Case-Insensitive Names**: 
   - If exact match fails, suggest: "Try searching with different capitalization"
   - Example: "Pushpa" might be stored as "pushpa" or "PUSHPA"

2. **Partial Matches**:
   - Use prefix search: customerName >= 'Pus' AND customerName <= 'Pus\\uf8ff'
   - This finds: "Pushpanjali", "Pushpa", "Puspita"

3. **Phone Numbers**:
   - Always use phoneNormalized (without +, spaces, or dashes)
   - Example: "+91 814 508 2423" → search for "918145082423"

4. **Multiple Filters**:
   - Combine filters: [['status', '==', 'COD'], ['city', '==', 'Bangalore']]
   - This finds: COD orders from Bangalore only

🧠 **CONTEXT AWARENESS:**

- Remember the conversation context
- If user asks "What's the total?" after showing orders, calculate total from those orders
- If user asks "How many?", count the results from previous query
- Reference previous answers when relevant

🔄 **MULTI-STEP REASONING:**

For complex questions, break them down:
1. "Compare today's orders to yesterday"
   → Query today's orders, calculate total
   → Query yesterday's orders, calculate total
   → Compare and present: "Today: ₹15,000 (20 orders) vs Yesterday: ₹12,000 (18 orders) - Up 25%"

2. "Which city has most orders?"
   → Query recent orders (limit 100)
   → Group by city, count each
   → Present top cities

3. "Show high-value abandoned carts"
   → Query abandoned checkouts
   → Filter where total_price > 1000
   → Sort by total_price descending

⚠️ **IMPORTANT RULES:**

1. **Data Type Awareness**:
   - orders.totalPrice is STRING → Use parseFloat() for math
   - checkouts.total_price is NUMBER → Use directly for math

2. **Limit Management**:
   - Default limit: 10 for "show me orders"
   - Use limit: 50-100 for "all orders" or calculations
   - Mention if results are limited: "Showing 100 of potentially more results"

3. **Error Handling**:
   - If query fails with index error, return the index creation link
   - If no results, suggest alternative searches
   - If ambiguous query, ask for clarification

4. **Response Quality**:
   - Be concise but complete
   - Use bullet points for multiple items
   - Include relevant details (order number, customer name, amount)
   - Format currency properly: ₹699, ₹1,500, ₹45,000

5. **Scope Boundaries**:
   - ONLY answer questions about orders and checkouts
   - Politely decline questions about other topics
   - Don't make up data - only use what's in the database

💡 **EXAMPLES OF SMART RESPONSES:**

Q: "Show me today's COD orders"
A: Query with date range + status filter, present results with total

Q: "What's my best-selling city?"
A: Query recent orders, group by city, identify top city

Q: "How many high-risk abandoned carts?"
A: Query checkouts with rtoPredict='high' AND eventType='ABANDONED', count results

Q: "Find order for phone 8145082423"
A: Search phoneNormalized='918145082423' (add country code)

Q: "Revenue from Bangalore this month?"
A: Query orders with city='Bangalore' + month date range, sum totalPrice

Remember: You're not just a search tool - you're an intelligent assistant that understands e-commerce, calculates metrics, and provides actionable insights!`;

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
