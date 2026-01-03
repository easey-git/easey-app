const { GoogleGenAI } = require("@google/genai");
const admin = require("firebase-admin");
const cors = require('cors')({ origin: true });

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
        console.error('Firebase Admin Init Error:', error);
    }
}
const db = admin.firestore();
const genAI = new GoogleGenAI(process.env.GEMINI_API_KEY);

// ---------------------------------------------------------
// SCHEMA DEFINITION - ORDERS & CHECKOUTS ONLY
// ---------------------------------------------------------
const DB_SCHEMA = `
You are an expert E-commerce Assistant focused EXCLUSIVELY on Orders and Abandoned Checkouts.
You have access to exactly TWO Firestore collections. Answer questions ONLY about these.

1. **ORDERS** (Collection: "orders")
   Schema based on actual data:
   - orderNumber (number): e.g. 1611
   - orderId (number): e.g. 6338007171326
   - customerName (string): e.g. "Pushpanjali ."
   - email (string): e.g. "xalxopushpanjali@gmail.com"
   - phone (string): e.g. "+918145082423"
   - phoneNormalized (string): e.g. "918145082423"
   - totalPrice (string): e.g. "699.00" (STORED AS STRING)
   - status (string): e.g. "COD", "Paid"
   - currency (string): "INR"
   - items (array): [{ name, price (string), quantity (number) }]
   - address1, city, state, zip (strings)
   - createdAt (timestamp): Order date
   - updatedAt (timestamp)
   - whatsappSent (boolean)

2. **CHECKOUTS** (Collection: "checkouts" -> Abandoned Carts)
   Schema based on actual data:
   - cart_id (string): e.g. "6956795f782cb32245101697"
   - eventType (string): "ABANDONED"
   - first_name, last_name (strings)
   - email (string)
   - phone_number (string): e.g. "8909261148"
   - phoneNormalized (string): e.g. "918909261148"
   - total_price (number): e.g. 699 (STORED AS NUMBER)
   - currency (string): "INR"
   - items (array): [{ name, title, price (number), quantity, product_id, variant_id, img_url }]
   - billing_address (map): { address1, city, state, zip, country, phone, email }
   - shipping_address (map): same structure as billing_address
   - latest_stage (string): e.g. "ORDER_SCREEN", "PHONE_RECEIVED"
   - payment_status (string): e.g. "Pending"
   - rtoPredict (string): e.g. "high", "low"
   - updatedAt (timestamp): Last activity
   - updated_at (string): ISO format
   - source_name (string): e.g. "fastrr"
   - shipping_price, tax, total_discount (numbers)

CRITICAL SEARCH RULES:
1. **Orders**:
   - Find by order number: filters=[['orderNumber', '==', 1611]] (as NUMBER)
   - Find by customer name: filters=[['customerName', '>=', 'Push'], ['customerName', '<=', 'Push\\uf8ff']]
   - Recent orders: orderBy=['createdAt', 'desc'], limit=10
   - By status: filters=[['status', '==', 'COD']]
   - By city: filters=[['city', '==', 'Bangalore']]

2. **Checkouts**:
   - Abandoned carts: filters=[['eventType', '==', 'ABANDONED']]
   - Recent: orderBy=['updatedAt', 'desc'], limit=10
   - By stage: filters=[['latest_stage', '==', 'ORDER_SCREEN']]
   - High RTO risk: filters=[['rtoPredict', '==', 'high']]

3. **Date Queries**:
   - For "today": Use date range with >= start of day, <= end of day
   - Example: filters=[['createdAt', '>=', '2026-01-04T00:00:00'], ['createdAt', '<=', '2026-01-04T23:59:59']]

4. **Resilience**:
   - If query fails due to missing index, return the index creation link
   - Always convert timestamps to ISO strings for display
   - Remember: totalPrice in orders is STRING, total_price in checkouts is NUMBER
`;

// ---------------------------------------------------------
// TOOLS IMPLEMENTATION
// ---------------------------------------------------------
const queryFirestore = async ({ collection, filters, limit, orderBy }) => {
    try {
        // Only allow orders and checkouts
        if (collection !== 'orders' && collection !== 'checkouts') {
            return `Error: Only 'orders' and 'checkouts' collections are supported.`;
        }

        let ref = db.collection(collection);

        if (filters && Array.isArray(filters)) {
            filters.forEach(([field, op, val]) => {
                ref = ref.where(field, op, val);
            });
        }

        if (orderBy && orderBy.length > 0) {
            ref = ref.orderBy(orderBy[0], orderBy[1] || 'desc');
        }

        const l = limit || 10;
        ref = ref.limit(l);

        const snapshot = await ref.get();
        if (snapshot.empty) return "No documents found.";

        return snapshot.docs.map(doc => {
            const data = doc.data();
            // Convert Firestore Timestamps to ISO strings
            Object.keys(data).forEach(k => {
                const val = data[k];
                if (val && typeof val === 'object' && val._seconds) {
                    data[k] = new Date(val._seconds * 1000).toISOString();
                } else if (val && val.toDate && typeof val.toDate === 'function') {
                    data[k] = val.toDate().toISOString();
                }
            });
            return { id: doc.id, ...data };
        });
    } catch (err) {
        // Handle missing index errors
        if (err.code === 9 || err.message.toLowerCase().includes('index')) {
            const indexUrl = err.message.match(/https?:\/\/[^\s]+/)?.[0];
            if (indexUrl) {
                return `[INDEX REQUIRED] Create index here: ${indexUrl}`;
            }
        }
        return `Error: ${err.message}`;
    }
};

// ---------------------------------------------------------
// MIDDLEWARE HELPERS
// ---------------------------------------------------------
function runMiddleware(req, res, fn) {
    return new Promise((resolve, reject) => {
        fn(req, res, (result) => {
            if (result instanceof Error) return reject(result);
            return resolve(result);
        });
    });
}

// ---------------------------------------------------------
// MAIN HANDLER
// ---------------------------------------------------------
module.exports = async (req, res) => {
    await runMiddleware(req, res, cors);

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const { prompt, history = [] } = req.body;

        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash-exp",
            systemInstruction: DB_SCHEMA,
            tools: [
                {
                    functionDeclarations: [
                        {
                            name: "queryFirestore",
                            description: "Query ONLY 'orders' or 'checkouts' collections.",
                            parameters: {
                                type: "OBJECT",
                                properties: {
                                    collection: {
                                        type: "STRING",
                                        enum: ["orders", "checkouts"],
                                        description: "Must be either 'orders' or 'checkouts'"
                                    },
                                    filters: {
                                        type: "ARRAY",
                                        description: "Array of [field, operator, value] filters",
                                        items: { type: "ARRAY", items: { type: "STRING" } }
                                    },
                                    limit: {
                                        type: "NUMBER",
                                        description: "Maximum number of documents to return (default: 10)"
                                    },
                                    orderBy: {
                                        type: "ARRAY",
                                        description: "Sort order: [field, direction]. Direction is 'asc' or 'desc'",
                                        items: { type: "STRING" }
                                    }
                                },
                                required: ["collection"]
                            }
                        }
                    ]
                }
            ]
        });

        const chat = model.startChat({
            history: history.map(h => ({
                role: h.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: h.content }]
            }))
        });

        let result = await chat.sendMessage(prompt);
        let response = result.response;

        const calls = response.functionCalls();
        if (calls && calls.length > 0) {
            const toolResults = [];
            for (const call of calls) {
                if (call.name === "queryFirestore") {
                    const data = await queryFirestore(call.args);
                    toolResults.push({
                        functionResponse: {
                            name: "queryFirestore",
                            response: { result: data }
                        }
                    });
                }
            }

            if (toolResults.length > 0) {
                const secondResult = await chat.sendMessage(toolResults);
                return res.status(200).json({ text: secondResult.response.text() });
            }
        }

        return res.status(200).json({ text: response.text() });

    } catch (error) {
        console.error('Assistant Error:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
};
