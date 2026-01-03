// Updated AI Capabilities: Analytics, Wallet, Campaigns
const { GoogleGenerativeAI } = require("@google/genai");
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const cors = require('cors')({ origin: true });

// ---------------------------------------------------------
// CONFIG & SECRETS
// ---------------------------------------------------------
const SERVICE_ACCOUNT = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

if (!getApps().length) {
    initializeApp({
        credential: cert(SERVICE_ACCOUNT)
    });
}

const db = getFirestore();
const genAI = new GoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });

// ---------------------------------------------------------
// SCHEMA DEFINITION (SIMPLIFIED - ORDERS ONLY)
// ---------------------------------------------------------
const DB_SCHEMA = `
You have read-access to a Firestore database for an e-commerce store.
Collections:
1. "orders"
   - documentId: Auto-generated string.
   - Fields: 
     - orderNumber (number): The official order number (e.g. 1001, 1630). NOT a string.
     - customerName (string): Full name. Case-sensitive.
     - totalPrice (string/number): Total value.
     - status (string): 'COD', 'Paid', 'CANCELLED'.
     - phoneNormalized (string): Phone number in E.164 format (e.g. 919876543210).
     - date (timestamp): Order date.
2. "checkouts" (Abandoned Carts)
   - Fields: total_price (number), first_name (string), eventType (string: 'ABANDONED', 'ACTIVE_CART'), updatedAt (timestamp).
3. "whatsapp_messages"
   - Fields: phone (string), direction (string: 'inbound', 'outbound'), body (string), status (string: 'sent', 'read', 'failed'), timestamp (timestamp).

SEARCH TIPS:
- For 'orderNumber', always query as a NUMBER, not a string.
- For names, if exact match fails, try querying just the first name.
- Timestamps are ISO strings.
`;

// ---------------------------------------------------------
// TOOLS IMPLEMENTATION
// ---------------------------------------------------------

const queryFirestore = async ({ collection, filters, limit, orderBy }) => {
    try {
        let ref = db.collection(collection);

        if (filters && Array.isArray(filters)) {
            filters.forEach(([field, op, val]) => {
                ref = ref.where(field, op, val);
            });
        }

        if (orderBy && orderBy.length > 0) {
            ref = ref.orderBy(orderBy[0], orderBy[1] || 'desc');
        }

        const l = limit || 5; // Keep it small and fast
        ref = ref.limit(l);

        const snapshot = await ref.get();
        if (snapshot.empty) return "No documents found.";

        return snapshot.docs.map(doc => {
            const data = doc.data();
            Object.keys(data).forEach(k => {
                if (data[k] && data[k]._seconds) {
                    data[k] = new Date(data[k]._seconds * 1000).toISOString();
                }
            });
            return { id: doc.id, ...data };
        });
    } catch (err) {
        return `Error querying database: ${err.message}`;
    }
};

// ---------------------------------------------------------
// MIDDLEWARE HELPER
// ---------------------------------------------------------
function runMiddleware(req, res, fn) {
    return new Promise((resolve, reject) => {
        fn(req, res, (result) => {
            if (result instanceof Error) {
                return reject(result);
            }
            return resolve(result);
        });
    });
}

// ---------------------------------------------------------
// MAIN HANDLER
// ---------------------------------------------------------
module.exports = async (req, res) => {
    await runMiddleware(req, res, cors);

    // Legacy manual headers (kept just in case, but overridden by cors)
    res.setHeader('Access-Control-Allow-Credentials', true);

    if (req.method === 'OPTIONS') {
        res.status(200).json({});
        return;
    }

    try {
        const { prompt, history = [] } = req.body;

        // Construct formatting instructions
        const formattingInstructions = `
        Format the response in pure Markdown.
        - Use simple lists or tables for data.
        - Bold key numbers (e.g. **Order #1001**).
        - Be concise.
        `;

        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash-exp",
            systemInstruction: `You are a helpful assistant for an e-commerce store owner.\n${DB_SCHEMA}\n${formattingInstructions}`,
            tools: [
                {
                    functionDeclarations: [
                        {
                            name: "queryFirestore",
                            description: "Query Firestore database. Use this to search for orders, customers, or messages.",
                            parameters: {
                                type: "OBJECT",
                                properties: {
                                    collection: { type: "STRING", description: "Collection name (e.g., 'orders', 'checkouts')" },
                                    filters: {
                                        type: "ARRAY",
                                        description: "List of filters e.g. [['status', '==', 'Paid']]",
                                        items: {
                                            type: "ARRAY",
                                            items: { type: "STRING" }
                                        }
                                    },
                                    limit: { type: "NUMBER", description: "Max number of results (default 5)" },
                                    orderBy: {
                                        type: "ARRAY",
                                        description: "['field', 'desc'|'asc']",
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

        const result = await chat.sendMessage(prompt);
        const response = result.response;

        // Handle function calls
        const functionCalls = response.functionCalls();
        if (functionCalls && functionCalls.length > 0) {
            const call = functionCalls[0];
            let functionResult;

            if (call.name === 'queryFirestore') {
                functionResult = await queryFirestore(call.args);
            }

            // Send function result back to model
            const result2 = await chat.sendMessage([{
                functionResponse: {
                    name: call.name,
                    response: { result: functionResult }
                }
            }]);

            return res.status(200).json({ text: result2.response.text() });
        }

        return res.status(200).json({ text: response.text() });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
};
