const { GoogleGenAI } = require("@google/genai");
const admin = require("firebase-admin");
const cors = require('cors')({ origin: true });

// ---------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------
const ALLOWED_COLLECTIONS = [
    'orders',
    'checkouts',
    'wallet_transactions',
    'campaigns',
    'whatsapp_messages',
    'users',
    'system' // For team_board
];

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 500;

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
// HELPER FUNCTIONS
// ---------------------------------------------------------

/**
 * Apply filters to a Firestore query reference
 */
const applyFilters = (ref, filters) => {
    let queryRef = ref;

    if (filters && Array.isArray(filters)) {
        for (const [field, op, val] of filters) {
            let queryVal = val;

            // --- SMART TYPE CONVERSION ---

            // Numbers
            if (['orderNumber', 'amount', 'totalPrice', 'count', 'spend', 'revenue', 'item_count'].includes(field)) {
                if (!isNaN(val) && val !== '' && val !== null) {
                    queryVal = Number(val);
                }
            }

            // Booleans
            if (['adminEdited', 'phone_verified', 'whatsappSent'].includes(field)) {
                if (val === 'true') queryVal = true;
                if (val === 'false') queryVal = false;
            }

            // Event Types (Normalization)
            if (field === 'eventType' && typeof val === 'string') {
                const lower = val.toLowerCase();
                const map = {
                    'abandoned': 'ABANDONED',
                    'init': 'init',
                    'payment_initiated': 'payment_initiated',
                    'order_placed': 'order_placed'
                };
                if (map[lower]) queryVal = map[lower];
            }

            // Dates
            if (['createdAt', 'updatedAt', 'date', 'timestamp'].includes(field) && typeof val === 'string') {
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
 * Convert Firestore types to JSON-friendly format
 */
const convertData = (data) => {
    const converted = { ...data };
    Object.keys(converted).forEach(key => {
        const val = converted[key];
        // Timestamp to ISO string
        if (val && typeof val === 'object' && val._seconds) {
            converted[key] = new Date(val._seconds * 1000).toISOString();
        }
        // Firestore Timestamp object
        else if (val && val.toDate && typeof val.toDate === 'function') {
            converted[key] = val.toDate().toISOString();
        }
    });
    return converted;
};

// ---------------------------------------------------------
// PERMISSION CHECKER
// ---------------------------------------------------------
const checkPermission = (collection, userContext) => {
    const { isAdmin, permissions = [] } = userContext;
    if (isAdmin) return true;

    // Mapping collections to permission strings
    const map = {
        'orders': 'access_orders',
        'checkouts': 'access_orders',
        'wallet_transactions': 'access_wallet',
        'campaigns': 'access_campaigns',
        'whatsapp_messages': 'access_whatsapp',
        'users': null, // Admin only
        'system': null // Admin only or specific logic
    };

    if (map[collection] === null) return false;
    return permissions.includes(map[collection]);
};

// ---------------------------------------------------------
// TOOLS
// ---------------------------------------------------------

const aggregateFirestore = async ({ collection, filters, aggregationType, field }, userContext) => {
    try {
        if (!checkPermission(collection, userContext)) {
            return `Error: Access Denied to ${collection}`;
        }

        let ref = db.collection(collection);
        ref = applyFilters(ref, filters);

        if (aggregationType === 'count') {
            const snapshot = await ref.count().get();
            return { count: snapshot.data().count };
        }

        if (['sum', 'average'].includes(aggregationType)) {
            if (!field) return `Error: 'field' required for ${aggregationType}`;

            const aggField = aggregationType === 'sum'
                ? admin.firestore.AggregateField.sum(field)
                : admin.firestore.AggregateField.average(field);

            const snapshot = await ref.aggregate({ result: aggField }).get();
            return { [aggregationType]: snapshot.data().result || 0 };
        }

        return "Error: Invalid aggregationType";
    } catch (err) {
        return `Error: ${err.message}`;
    }
};

const queryFirestore = async ({ collection, filters, limit, orderBy }, userContext) => {
    try {
        if (!checkPermission(collection, userContext)) {
            return `Error: Access Denied to ${collection}`;
        }

        // Special handling for Team Board single doc
        if (collection === 'system') {
            const doc = await db.collection('system').doc('team_board').get();
            return doc.exists ? [{ id: 'team_board', ...convertData(doc.data()) }] : "No team_board found";
        }

        let ref = db.collection(collection);
        ref = applyFilters(ref, filters);

        if (orderBy && orderBy.length > 0) {
            ref = ref.orderBy(orderBy[0], orderBy[1] || 'desc');
        }

        const queryLimit = Math.min(limit || DEFAULT_LIMIT, MAX_LIMIT);
        ref = ref.limit(queryLimit);

        const snapshot = await ref.get();
        if (snapshot.empty) return "No documents found.";

        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...convertData(doc.data())
        }));

    } catch (err) {
        return `Error: ${err.message}`;
    }
};

const TOOLS = [{
    functionDeclarations: [
        {
            name: "queryFirestore",
            description: "Fetch list of documents. returns array of objects.",
            parametersJsonSchema: {
                type: "object",
                properties: {
                    collection: { type: "string", enum: ALLOWED_COLLECTIONS },
                    filters: {
                        type: "array",
                        items: { type: "array", items: { type: "string" } },
                        description: "[[field, op, value], ...]"
                    },
                    limit: { type: "number" },
                    orderBy: { type: "array", items: { type: "string" } }
                },
                required: ["collection"]
            }
        },
        {
            name: "aggregateFirestore",
            description: "Perform DB math: count, sum, average.",
            parametersJsonSchema: {
                type: "object",
                properties: {
                    collection: { type: "string", enum: ALLOWED_COLLECTIONS },
                    filters: { type: "array" },
                    aggregationType: { type: "string", enum: ["count", "sum", "average"] },
                    field: { type: "string" }
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
    await new Promise(resolve => cors(req, res, resolve));
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (!ai) return res.status(500).json({ error: 'AI not configured' });

    try {
        // --- AUTH ---
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Missing token' });

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);
        const uid = decodedToken.uid;

        const userDoc = await db.collection('users').doc(uid).get();
        const userData = userDoc.data() || {};
        const userContext = {
            userId: uid,
            isAdmin: userData.role === 'admin',
            permissions: userData.permissions || []
        };

        const { prompt, history = [] } = req.body;
        const todayStr = new Date().toISOString().split('T')[0];

        // --- BRAIN ---
        const SYSTEM_INSTRUCTION = `You are 'Sidekick', the expert AI Data Analyst for this E-commerce business. 
You are highly intelligent, proactive, and business-savvy.
Current Date: ${todayStr}.

🔥 **Capabilities**:
- Financial Audits (Income vs Expense)
- Order Tracking (Status, Customers)
- Marketing Analysis (ROAS, Ad Spend)
- Support History (WhatsApp logs)
- Team Management (User roles)

📊 **DATABASE SCHEMA (Memory)**:

1. **orders**:
   - \`orderNumber\` (number), \`totalPrice\` (number), \`status\` ("Paid", "Pending"), \`customerName\`, \`phoneNormalized\`, \`city\`, \`state\`, \`items\` (array), \`adminEdited\` (bool), \`cod_status\`.
   - USE: finding customers, sales reports.

2. **checkouts** (Abandoned Carts):
   - \`eventType\` ("ABANDONED", "order_placed"), \`total_price\`, \`items\`, \`email\`, \`phoneNormalized\`.
   - USE: recovery opportunities, cart analysis.

3. **wallet_transactions** (Finance):
   - \`amount\` (number), \`type\` ("income", "expense"), \`category\` (e.g. "Food", "Business"), \`description\` (e.g. "Delhivery", "Meta"), \`date\` (timestamp).
   - ⚠️ INTELLIGENCE: Always split totals by TYPE. Never sum income + expense.

4. **campaigns** (Marketing):
   - \`name\`, \`status\`, \`spend\` (number), \`revenue\` (number), \`impressions\`, \`clicks\`.
   - 💡 INSIGHT: Calculate ROAS = (revenue / spend).

5. **whatsapp_messages** (Support):
   - \`body\`, \`phoneNormalized\`, \`direction\` ("inbound", "outbound"), \`status\`.
   - USE: "What did X say?", "Last message to Y?".

6. **users** (Team):
   - \`email\`, \`role\`, \`displayName\`.
   - USE: "Who is admin?", "List staff".

7. **system** (Team Board):
   - Doc ID: 'team_board'. Fields: \`content\`, \`lastEditedBy\`.
   - USE: "What's on the board?".

🧠 **ADVANCED RULES**:
1. **Financial Precision**: 
   - Query: "Money from DEL?" -> 
     a) Sum(income, desc='DEL') 
     b) Sum(expense, desc='DEL')
     -> Report both.
2. **Context Inference**:
   - "Meta" -> Search \`campaigns\` (spend) OR \`wallet_transactions\` (description='Meta'). Ask if unclear or show both.
3. **Date Intelligence**:
   - "Last week" -> Compute start/end dates for filter filters \`[['date', '>=', '...'], ['date', '<=', '...']]\`.
   - "Recent" -> Sort by \`desc\`.
4. **Fuzzy Handling**:
   - If user asks for "Delhivery" but data uses "DEL", search for both if possible, or inform user.

💡 **Response Style**:
- Professional, concise, data-rich.
- Bold key numbers (e.g., **₹50,000**).
- If performance is bad (e.g., ROAS < 2), flag it 🔴. If good, 🟢.
`;

        const contents = [
            ...history.map(msg => ({
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: msg.content }]
            })),
            { role: 'user', parts: [{ text: prompt }] }
        ];

        let response = await ai.models.generateContent({
            model: 'gemini-2.0-flash-exp',
            contents,
            config: {
                systemInstruction: SYSTEM_INSTRUCTION,
                tools: TOOLS
            }
        });

        // Loop for function calls
        while (response.functionCalls && response.functionCalls.length > 0) {
            const call = response.functionCalls[0]; // Gemini 2.0 Flash usually does one at a time sequentially
            const { name, args } = call;

            let result;
            if (name === 'queryFirestore') result = await queryFirestore(args, userContext);
            if (name === 'aggregateFirestore') result = await aggregateFirestore(args, userContext);

            // Add turn to history
            contents.push({
                role: 'model',
                parts: [{ functionCall: { name, args } }]
            });
            contents.push({
                role: 'user',
                parts: [{ functionResponse: { name, response: { result } } }]
            });

            response = await ai.models.generateContent({
                model: 'gemini-2.0-flash-exp',
                contents,
                config: { systemInstruction: SYSTEM_INSTRUCTION, tools: TOOLS }
            });
        }

        res.json({ text: response.text });

    } catch (error) {
        console.error('AI Error:', error);
        res.status(500).json({ error: error.message });
    }
};
