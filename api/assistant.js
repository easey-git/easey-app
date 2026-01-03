const { GoogleGenerativeAI } = require("@google/generative-ai");
const admin = require("firebase-admin");

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

// ---------------------------------------------------------
// SCHEMA DEFINITION (The "Brain" Knowledge)
// ---------------------------------------------------------
const DB_SCHEMA = `
You have read-access to a Firestore database for an e-commerce store.
Collections:
1. "orders"
   - documentId: Auto-generated
   - Fields: orderNumber (string), customerName (string), totalPrice (number), status (string: 'COD', 'Paid', 'CANCELLED'), verified (boolean), createdAt (timestamp), phone (string).
2. "checkouts" (Abandoned Carts)
   - Fields: total_price (number), first_name (string), eventType (string: 'ABANDONED', 'ACTIVE_CART'), updatedAt (timestamp).
3. "whatsapp_messages"
   - Fields: phone (string), direction (string: 'inbound', 'outbound'), body (string), status (string: 'sent', 'read', 'failed'), timestamp (timestamp).
`;

// ---------------------------------------------------------
// TOOLS
// ---------------------------------------------------------
const queryFirestore = async ({ collection, filters, limit = 5, orderBy }) => {
    try {
        let ref = db.collection(collection);

        // Apply filters: [[field, op, value], ...]
        if (filters && Array.isArray(filters)) {
            filters.forEach(([field, op, val]) => {
                // Fix timestamp queries if val is a string 'NOW-7DAYS' etc (simple parsing)
                // For now, assume simple values or handle date strings in next iteration
                ref = ref.where(field, op, val);
            });
        }

        if (orderBy) {
            // array: [field, direction]
            ref = ref.orderBy(orderBy[0], orderBy[1] || 'desc');
        }

        if (limit) {
            ref = ref.limit(limit);
        }

        const snapshot = await ref.get();
        if (snapshot.empty) return "No documents found.";

        return snapshot.docs.map(doc => {
            const data = doc.data();
            // Convert timestamps to readable dates
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

const tools = {
    queryFirestore: queryFirestore
};

// ---------------------------------------------------------
// MAIN HANDLER
// ---------------------------------------------------------
module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const { prompt, history = [] } = req.body;

        if (!process.env.GEMINI_API_KEY) {
            throw new Error("Missing GEMINI_API_KEY");
        }

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            // Define the tool available to the model
            tools: [{
                functionDeclarations: [{
                    name: "queryFirestore",
                    description: "Fetch data from the database. Use this when the user asks for specific records, stats, or summaries of orders/carts/messages.",
                    parameters: {
                        type: "OBJECT",
                        properties: {
                            collection: {
                                type: "STRING",
                                description: "Collection name: 'orders', 'checkouts', or 'whatsapp_messages'"
                            },
                            filters: {
                                type: "ARRAY",
                                description: "List of filters. Each filter is [field, operator, value]. Example: [['status', '==', 'COD'], ['totalPrice', '>', 1000]]",
                                items: {
                                    type: "ARRAY",
                                    items: {
                                        type: "STRING" // Simplified for JSON schema
                                    }
                                }
                            },
                            limit: { type: "NUMBER", description: "Max results to return. Default 5. Max 20." },
                            orderBy: {
                                type: "ARRAY",
                                description: "[field, direction]. Example: ['createdAt', 'desc']",
                                items: { type: "STRING" }
                            }
                        },
                        required: ["collection"]
                    }
                }]
            }]
        });

        // Start Chat Session
        const chat = model.startChat({
            history: [
                {
                    role: "user",
                    parts: [{
                        text: `System: You are Easey, a helpful e-commerce assistant. 
                    Be concise. Use the 'queryFirestore' tool to find real data. 
                    ${DB_SCHEMA}`
                    }]
                },
                ...history
                // Note: Real history would need correct format mapping (user/model roles)
            ]
            // In a simple stateless request, we might just pass the new prompt if history is complex
        });

        const result = await chat.sendMessage(prompt);
        const response = result.response;

        // Handle Tool Calls
        const calls = response.functionCalls(); // Check if model wants to call a function

        if (calls && calls.length > 0) {
            const call = calls[0];
            const functionName = call.name;
            const args = call.args;

            if (functionName === "queryFirestore") {
                // Execute the actual DB query
                const dbResult = await queryFirestore(args);

                // Send the DB result back to the model to generate the final answer
                const finalResult = await chat.sendMessage([
                    {
                        functionResponse: {
                            name: "queryFirestore",
                            response: { result: dbResult }
                        }
                    }
                ]);

                return res.status(200).json({
                    text: finalResult.response.text(),
                    data: dbResult // Optional: Send raw data to frontend for charts?
                });
            }
        }

        // No tool call, just text
        return res.status(200).json({ text: response.text() });

    } catch (error) {
        console.error("Assistant Error:", error);
        res.status(500).json({ error: error.message });
    }
};
