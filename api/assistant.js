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
// SCHEMA DEFINITION
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

        const l = limit || 5;
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

        // Tool Definition using parametersJsonSchema as per V2 docs
        const queryTimestampDesc = {
            name: 'queryFirestore',
            description: "Fetch data from the database. Use this when the user asks for specific records, stats, or summaries of orders/carts/messages.",
            parametersJsonSchema: {
                type: 'object',
                properties: {
                    collection: {
                        type: 'string',
                        description: "Collection name: 'orders', 'checkouts', or 'whatsapp_messages'"
                    },
                    filters: {
                        type: 'array',
                        items: {
                            type: 'array',
                            items: { type: 'string' } // Simplified
                        }
                    },
                    limit: { type: 'number' },
                    orderBy: {
                        type: 'array',
                        items: { type: 'string' }
                    }
                },
                required: ['collection'],
            },
        };

        const config = {
            tools: [{ functionDeclarations: [queryTimestampDesc] }],
        };

        // Construct Content with System Prompt logic
        // Since we are stateless, we prepend system prompt info to the user prompt or use a "Developer System Instruction" if supported,
        // but simple concatenation works reliably.
        const fullPrompt = `System: ${DB_SCHEMA}\nUser Query: ${prompt}`;

        // 1. First Turn: Send user query with tools configured
        const response1 = await ai.models.generateContent({
            model: 'gemini-2.0-flash-exp',
            contents: fullPrompt, // passing string directly is valid in V2
            config: config
        });

        const candidates = response1.candidates;
        if (!candidates || candidates.length === 0) {
            return res.status(200).json({ text: "No response." });
        }

        const firstCand = candidates[0];
        const content = firstCand.content;
        const parts = content.parts;

        // Check for function calls
        const functionCalls = parts ? parts.filter(p => p.functionCall) : [];

        if (functionCalls.length > 0) {
            const toolOutputs = [];

            // Execute all function calls
            for (const part of functionCalls) {
                const call = part.functionCall;
                if (call.name === 'queryFirestore') {
                    // The args come as a plain object in V2
                    const result = await queryFirestore(call.args);

                    // Construct function response part
                    toolOutputs.push({
                        functionResponse: {
                            name: 'queryFirestore',
                            response: { result: result }
                        }
                    });
                }
            }

            // 2. Second Turn: Send tool outputs back to model to get final answer
            // We must provide the FULL history: [UserPrompt, ModelResponseWithCall, ToolOutputs]

            // Reconstruct the previous turn properly as Part objects
            // Note: 'parts' from response1 are already valid Part objects

            const historyContents = [
                { role: 'user', parts: [{ text: fullPrompt }] },
                { role: 'model', parts: parts } // The model's request to call function
            ];

            // The next message contains the tool outputs
            const toolMessage = {
                role: 'user', // In V2, typically tool outputs are 'function_response' role or 'user' role depending on strictness, but docs say "Send the result back (with history)"
                parts: toolOutputs
            };

            // Generate final content based on conversation
            // Note: using generateContent with full history array:
            const response2 = await ai.models.generateContent({
                model: 'gemini-2.0-flash-exp',
                contents: [...historyContents, toolMessage],
                config: config
            });

            const finalText = response2.text; // helper getter
            return res.status(200).json({
                text: finalText,
                data: toolOutputs[0].functionResponse.response.result
            });

        } else {
            // Just a text response
            return res.status(200).json({ text: response1.text });
        }

    } catch (error) {
        console.error("Assistant Error:", error);
        res.status(500).json({ error: error.message, stack: error.stack });
    }
};
