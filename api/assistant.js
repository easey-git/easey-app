const { GoogleGenAI } = require("@google/genai");
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
   - Fields: orderNumber (string), customerName (string), totalPrice (number), status (string: 'COD', 'PaidCANCELLED'), verified (boolean), createdAt (timestamp), phone (string).
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

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

        // Define Tool Configuration
        const toolConfig = {
            functionDeclarations: [
                {
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
                                        type: "STRING"
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
                }
            ]
        };

        // Prepare History + System Prompt
        // Note: The new SDK handles chat history differently, usually via `chats.create()`
        // But for single turn with history array or just prompt:

        let contents = [];

        // Add System Prompt first
        const systemPrompt = `System: You are Easey, a helpful e-commerce assistant. 
        Be concise. Use the 'queryFirestore' tool to find real data. 
        ${DB_SCHEMA}`;

        // Add history if present
        if (history && history.length > 0) {
            // Map simple history to SDK format if needed, simplistic approach for now
            // The SDK expects { role: 'user'|'model', parts: [{ text: ... }] }
            // Assuming history comes in clean or we just use current prompt
        }

        // Create Chat Session
        const chat = ai.chats.create({
            model: "gemini-1.5-flash", // Using 1.5-flash as 2.5 is likely preview-only
            config: {
                tools: [toolConfig]
            },
            history: [
                { role: "user", parts: [{ text: systemPrompt }] },
                { role: "model", parts: [{ text: "Understood. I am Easey." }] },
                // ...history maps here
            ]
        });

        const result = await chat.send({
            parts: [{ text: prompt }]
        });

        // Loop for tool calls (automatic execution is not yet standard in single call, usually manual loop)
        // Check `result.functionCalls()`

        let finalResponseText = "";

        // Manual Tool Execution Loop
        // The V2 SDK response structure:
        const firstCandidate = result.candidates[0];

        // Check if there are function calls
        // Note: The structure varies, check documentation or inspect object
        // Usually: candidate.content.parts array contains functionCall

        const toolCalls = firstCandidate.content.parts?.filter(p => p.functionCall);

        if (toolCalls && toolCalls.length > 0) {
            // Execute tools
            let toolOutputs = [];

            for (const part of toolCalls) {
                const call = part.functionCall;
                if (call.name === 'queryFirestore') {
                    const dbResult = await queryFirestore(call.args);
                    toolOutputs.push({
                        functionResponse: {
                            name: 'queryFirestore',
                            response: { name: 'queryFirestore', content: dbResult }
                        }
                    });
                }
            }

            // Send Tool Output back to model
            const finalResult = await chat.send({
                parts: toolOutputs
            });

            finalResponseText = finalResult.text;
            return res.status(200).json({
                text: finalResponseText,
                data: toolOutputs[0].functionResponse.response.content // Return raw data too
            });

        } else {
            finalResponseText = result.text;
        }

        return res.status(200).json({ text: finalResponseText });

    } catch (error) {
        console.error("Assistant Error:", error);
        res.status(500).json({ error: error.message, stack: error.stack });
    }
};
