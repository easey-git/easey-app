const { GoogleGenAI } = require("@google/genai");
const admin = require("firebase-admin");
const cors = require('cors')({ origin: true });

// ---------------------------------------------------------
// CONFIGURATION & CONSTANTS
// ---------------------------------------------------------
const CONFIG = {
    TIMEZONE: 'Asia/Kolkata', // Business operates in IST
    LOCALE: 'en-IN',
    MAX_LIMIT: 500,
    DEFAULT_LIMIT: 10
};

const ALLOWED_COLLECTIONS = [
    'orders', 'checkouts', 'wallet_transactions',
    'campaigns', 'whatsapp_messages', 'users', 'system'
];

// ---------------------------------------------------------
// SCHEMAS (Single Source of Truth)
// ---------------------------------------------------------
const DB_SCHEMA = `
1. **orders** (Sales):
   - Fields: orderNumber (num), totalPrice (num), status (str), customerName, phoneNormalized, city, state, createdAt (ISO timestamp).
   - Key Filter: 'createdAt' for dates.

2. **checkouts** (Abandoned Carts):
   - Fields: eventType ('ABANDONED', 'order_placed'), total_price, email, phoneNormalized, updatedAt (ISO timestamp).
   - Key Filter: 'updatedAt' for recency.

3. **wallet_transactions** (Finance):
   - Fields: amount (num), type ('income', 'expense'), category, description, date (ISO timestamp).
   - Key Filter: 'date'.
   - rule: NEVER sum income and expense together.

4. **campaigns** (Marketing):
   - Fields: name, status, spend (num), revenue (num), impressions.
   - metric: ROAS = revenue / spend.

5. **whatsapp_messages** (Support):
   - Fields: body, phoneNormalized, direction ('inbound', 'outbound'), timestamp.

6. **users** (Team):
   - Fields: email, role, displayName.

7. **system** (Team Board):
   - Doc: 'team_board'. Fields: content, lastEditedBy.
`;

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
        console.error('[Firebase] Init Error:', error.message);
    }
}
const db = admin.firestore();

let ai;
try {
    if (!process.env.GEMINI_API_KEY) throw new Error("Missing API Key");
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
} catch (error) {
    console.error('[Gemini] Init Error:', error.message);
}

// ---------------------------------------------------------
// STANDARD HELPERS
// ---------------------------------------------------------

/**
 * Get standard business date context
 */
const getDateContext = () => {
    const now = new Date();

    // Formatters
    const fmtDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: CONFIG.TIMEZONE,
        year: 'numeric', month: '2-digit', day: '2-digit'
    });
    const fmtTime = new Intl.DateTimeFormat(CONFIG.LOCALE, {
        timeZone: CONFIG.TIMEZONE,
        hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: true
    });

    // Calculate relative dates properly using midnight-today reference
    const todayStr = fmtDate.format(now); // YYYY-MM-DD

    // Create Date object for "Today 00:00" in target timezone to subtract days safely
    // simple math: just subtract 24h from now is risky for boundaries.
    // Better: Helper to subtract days from the string date
    const getShiftedDate = (days) => {
        const d = new Date(now.toLocaleString('en-US', { timeZone: CONFIG.TIMEZONE }));
        d.setDate(d.getDate() - days);
        return fmtDate.format(d);
    };

    return {
        today: todayStr,
        yesterday: getShiftedDate(1),
        lastWeekStart: getShiftedDate(7),
        currentTime: fmtTime.format(now),
        timezone: CONFIG.TIMEZONE
    };
};

/**
 * Sanitize and Type-Cast Filter Values
 */
const sanitizeFilterValue = (field, value) => {
    if (value === null || value === undefined) return value; // Let firestore handle or error

    // Numeric Fields
    const numberFields = ['orderNumber', 'amount', 'totalPrice', 'count', 'spend', 'revenue', 'item_count'];
    if (numberFields.includes(field) && !isNaN(value) && value !== '') {
        return Number(value);
    }

    // Boolean Fields
    if (['adminEdited', 'whatsappSent'].includes(field)) {
        if (String(value).toLowerCase() === 'true') return true;
        if (String(value).toLowerCase() === 'false') return false;
    }

    // Date Strings: Ensure valid ISO or leave as string (Firestore handles ISO strings well)
    // We strictly use ISO strings (YYYY-MM-DD) for comparisons in Firestore queries from AI

    return value;
};

const applyFilters = (ref, filters) => {
    let queryRef = ref;
    if (!filters || !Array.isArray(filters)) return queryRef;

    for (const filter of filters) {
        if (!Array.isArray(filter) || filter.length !== 3) continue;
        const [field, op, rawVal] = filter;
        const val = sanitizeFilterValue(field, rawVal);
        queryRef = queryRef.where(field, op, val);
    }
    return queryRef;
};

const convertTimestamps = (data) => {
    const res = { ...data };
    for (const k in res) {
        const v = res[k];
        if (v && typeof v === 'object' && v._seconds) {
            res[k] = new Date(v._seconds * 1000).toISOString();
        } else if (v && v.toDate && typeof v.toDate === 'function') {
            res[k] = v.toDate().toISOString();
        }
    }
    return res;
};

// ---------------------------------------------------------
// DATA TOOLS
// ---------------------------------------------------------
const tools = {
    queryFirestore: async (args, { permissions, isAdmin }) => {
        const { collection, filters, limit = CONFIG.DEFAULT_LIMIT, orderBy } = args;

        // Permission Check
        const accessMap = {
            'orders': 'access_orders', 'checkouts': 'access_orders',
            'wallet_transactions': 'access_wallet', 'campaigns': 'access_campaigns',
            'whatsapp_messages': 'access_whatsapp', 'users': 'ADMIN', 'system': 'ADMIN'
        };
        const requiredPerm = accessMap[collection];

        if (!isAdmin && requiredPerm !== 'ADMIN' && !permissions.includes(requiredPerm)) {
            throw new Error(`Access Denied: Missing ${requiredPerm}`);
        }
        if (requiredPerm === 'ADMIN' && !isAdmin) {
            throw new Error(`Access Denied: Admin only`);
        }

        // Special Case
        if (collection === 'system') {
            const doc = await db.collection('system').doc('team_board').get();
            return doc.exists ? [{ id: 'team_board', ...convertTimestamps(doc.data()) }] : [];
        }

        let ref = db.collection(collection);
        ref = applyFilters(ref, filters);

        if (orderBy && orderBy.length > 0) {
            ref = ref.orderBy(orderBy[0], orderBy[1] || 'desc');
        }

        const safeLimit = Math.min(limit, CONFIG.MAX_LIMIT);
        ref = ref.limit(safeLimit);

        const snapshot = await ref.get();
        if (snapshot.empty) return [];
        return snapshot.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) }));
    },

    aggregateFirestore: async (args, { permissions, isAdmin }) => {
        const { collection, filters, aggregationType, field } = args;

        // Basic permission check (same as query)
        const accessMap = {
            'orders': 'access_orders', 'checkouts': 'access_orders',
            'wallet_transactions': 'access_wallet', 'campaigns': 'access_campaigns'
        };
        if (!isAdmin && !permissions.includes(accessMap[collection])) {
            throw new Error("Access Denied");
        }

        let ref = db.collection(collection);
        ref = applyFilters(ref, filters);

        if (aggregationType === 'count') {
            const snap = await ref.count().get();
            return { count: snap.data().count };
        }

        if (['sum', 'average'].includes(aggregationType)) {
            if (!field) throw new Error("Field required for math aggregation");
            const aggField = aggregationType === 'sum'
                ? admin.firestore.AggregateField.sum(field)
                : admin.firestore.AggregateField.average(field);
            const snap = await ref.aggregate({ result: aggField }).get();
            return { [aggregationType]: snap.data().result || 0 };
        }

        throw new Error("Invalid aggregation type");
    }
};

const GEMINI_TOOLS = [{
    functionDeclarations: [
        {
            name: "queryFirestore",
            description: "Retrieve records from database. Use for lists, search, or details.",
            parametersJsonSchema: {
                type: "object",
                properties: {
                    collection: { type: "string", enum: ALLOWED_COLLECTIONS },
                    filters: { type: "array", description: "Array of [field, operator, value]. Date values must be ISO strings." },
                    limit: { type: "number" },
                    orderBy: { type: "array", items: { type: "string" } }
                },
                required: ["collection"]
            }
        },
        {
            name: "aggregateFirestore",
            description: "Calculate totals. Use for 'How many', 'Total amount', 'Average'.",
            parametersJsonSchema: {
                type: "object",
                properties: {
                    collection: { type: "string", enum: ALLOWED_COLLECTIONS },
                    filters: { type: "array" },
                    aggregationType: { type: "string", enum: ["count", "sum", "average"] },
                    field: { type: "string", description: "Field to calculate on (e.g., 'totalPrice', 'amount')" }
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
    if (!ai) return res.status(500).json({ error: 'System configuration error' });

    try {
        // 1. Authenticate
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

        const token = authHeader.split('Bearer ')[1];
        const decoded = await admin.auth().verifyIdToken(token);
        const userDoc = await db.collection('users').doc(decoded.uid).get();
        const userData = userDoc.data() || {};

        const userContext = {
            uid: decoded.uid,
            isAdmin: userData.role === 'admin',
            permissions: userData.permissions || []
        };

        // 2. Prepare Context
        const { prompt, history = [] } = req.body;
        const dateCtx = getDateContext();

        const SYSTEM_PROMPT = `You are 'Sidekick', a professional Business Data Analyst.
You have direct read-access to the company's live database.

🌍 **Operational Context**:
- **Date**: ${dateCtx.today} (YYYY-MM-DD)
- **Time**: ${dateCtx.currentTime} (${dateCtx.timezone})
- **Yesterday**: ${dateCtx.yesterday}
- **Last Week**: ${dateCtx.lastWeekStart}

📂 **Data Schema**:
${DB_SCHEMA}

⚖️ **Operational Rules**:
1. **Precise Dates**: When user asks for "Today" or "Yesterday", ALWAYS apply a filter range (YYYY-MM-DDT00:00:00 to 23:59:59).
2. **Financial Accuracy**: Income and Expenses are separate streams. Never mix them.
3. **No Raw Data**: Summarize findings in natural language. Do not output JSON.
4. **Be Proactive**: If ROAS is low, say it. If sales are high, highlight it.

Answer the user's request now.`;

        // 3. Chat Interaction Loop
        const chatHistory = [
            ...history.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
            { role: 'user', parts: [{ text: prompt }] }
        ];

        let response = await ai.models.generateContent({
            model: 'gemini-2.0-flash-exp',
            contents: chatHistory,
            config: { systemInstruction: SYSTEM_PROMPT, tools: GEMINI_TOOLS }
        });

        // 4. Tool Execution Loop
        while (response.functionCalls?.length > 0) {
            const call = response.functionCalls[0];
            const ToolFunction = tools[call.name];

            let result;
            try {
                if (ToolFunction) {
                    result = await ToolFunction(call.args, userContext);
                } else {
                    result = { error: "Function not found" };
                }
            } catch (err) {
                result = { error: err.message };
            }

            chatHistory.push({ role: 'model', parts: [{ functionCall: call }] });
            chatHistory.push({ role: 'user', parts: [{ functionResponse: { name: call.name, response: { result } } }] });

            response = await ai.models.generateContent({
                model: 'gemini-2.0-flash-exp',
                contents: chatHistory,
                config: { systemInstruction: SYSTEM_PROMPT, tools: GEMINI_TOOLS }
            });
        }

        // 5. Final Response
        res.json({ text: response.text });

    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
};
