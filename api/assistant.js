const { GoogleGenAI } = require("@google/genai");
const admin = require("firebase-admin");
const cors = require('cors')({ origin: true });

// ---------------------------------------------------------
// 1. CONFIGURATION & HIGH-PERFORMANCE SETTINGS
// ---------------------------------------------------------
const CONFIG = {
    TIMEZONE: 'Asia/Kolkata',
    LOCALE: 'en-IN',
    MAX_LIMIT: 500,
    DEFAULT_LIMIT: 20
};

// ---------------------------------------------------------
// 2. INITIALIZATION
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
// 3. INTELLIGENT HELPERS (The "Brain" Utilities)
// ---------------------------------------------------------
const getDateContext = () => {
    const now = new Date();
    const fmt = (d) => d.toLocaleDateString('en-CA', { timeZone: CONFIG.TIMEZONE }); // YYYY-MM-DD

    // Calculate Shifts in IST
    const getShifted = (days) => {
        const d = new Date(now.toLocaleString('en-US', { timeZone: CONFIG.TIMEZONE }));
        d.setDate(d.getDate() - days);
        return fmt(d);
    };

    return {
        today: fmt(now),
        yesterday: getShifted(1),
        startOfWeek: getShifted(now.getDay()), // Sunday
        startOfMonth: getShifted(now.getDate() - 1),
        timezone: CONFIG.TIMEZONE
    };
};

const formatCurrency = (amount) => {
    return new Intl.NumberFormat(CONFIG.LOCALE, { style: 'currency', currency: 'INR' }).format(amount);
};

// ---------------------------------------------------------
// 4. "SUPER TOOLS" (Business Logic Layer)
// ---------------------------------------------------------
const DATA_TOOLS = {

    /**
     * 📊 getFinancialReport
     * Calculates Income, Expense, and Net Profit in parallel.
     * Prevents AI from doing bad math or multiple round-trips.
     */
    getFinancialReport: async (args, { permissions }) => {
        if (!permissions.includes('access_wallet')) throw new Error("Permission Denied: Wallet");

        const { startDate, endDate, category } = args;
        const walletRef = db.collection('wallet_transactions');

        // Base Query
        let q = walletRef.where('date', '>=', startDate + 'T00:00:00')
            .where('date', '<=', endDate + 'T23:59:59');

        if (category) q = q.where('category', '==', category);

        // Fetch ALL transactions in range (up to safe limit) to aggregate accurately
        // Note: For massive scale, we'd use aggregation queries, but for <500 items, client-side math is smarter for categorization.
        const snapshot = await q.limit(1000).get();

        const stats = {
            total_income: 0,
            total_expense: 0,
            net_profit: 0,
            transaction_count: snapshot.size,
            breakdown: {}
        };

        snapshot.forEach(doc => {
            const data = doc.data();
            const amt = Number(data.amount) || 0;

            if (data.type === 'income') {
                stats.total_income += amt;
            } else if (data.type === 'expense') {
                stats.total_expense += amt;
                // Track expense categories
                const cat = data.category || 'Uncategorized';
                stats.breakdown[cat] = (stats.breakdown[cat] || 0) + amt;
            }
        });

        stats.net_profit = stats.total_income - stats.total_expense;

        // Return highly readable summary
        return {
            ...stats,
            formatted: `Income: ${formatCurrency(stats.total_income)} | Expense: ${formatCurrency(stats.total_expense)} | Net: ${formatCurrency(stats.net_profit)}`
        };
    },

    /**
     * 👤 getCustomer360
     * Aggregates EVERYTHING about a customer by Phone Number.
     * Links Orders + Cart + Support Chat.
     */
    getCustomer360: async (args, { permissions, isAdmin }) => {
        if (!isAdmin && !permissions.includes('access_orders')) throw new Error("Permission Denied: Customer Data");

        const { phone } = args;
        if (!phone) throw new Error("Phone number required for 360 view");

        // Normalize phone (remove +91, spaces)
        // Fuzzy match strategy: search for the last 10 digits
        const cleanPhone = phone.replace(/\D/g, '').slice(-10);

        // Run Parallel Queries
        const [ordersSnap, cartsSnap, chatsSnap] = await Promise.all([
            db.collection('orders').where('phoneNormalized', '>=', cleanPhone).limit(20).get(),
            db.collection('checkouts').where('phoneNormalized', '>=', cleanPhone).limit(5).get(),
            db.collection('whatsapp_messages').where('phoneNormalized', '>=', cleanPhone).limit(10).get()
        ]);

        const orders = ordersSnap.docs.map(d => d.data()).filter(d => d.phoneNormalized?.includes(cleanPhone));
        const carts = cartsSnap.docs.map(d => d.data()).filter(d => d.phoneNormalized?.includes(cleanPhone));
        const chats = chatsSnap.docs.map(d => d.data()).filter(d => d.phoneNormalized?.includes(cleanPhone));

        // Calculate Metrics
        const totalSpend = orders.reduce((sum, o) => sum + (o.totalPrice || 0), 0);
        const ltv = formatCurrency(totalSpend);

        return {
            customer_profile: {
                found: orders.length > 0 || carts.length > 0,
                phone: cleanPhone,
                lifetime_value: ltv,
                total_orders: orders.length,
                pending_carts: carts.length,
            },
            recent_orders: orders.slice(0, 3).map(o => ({
                id: o.orderNumber, status: o.status, total: o.totalPrice, date: o.createdAt
            })),
            recent_abandoned_carts: carts.map(c => ({
                items: c.items?.length, total: c.total_price, date: c.updatedAt
            })),
            last_support_message: chats.length ? chats[chats.length - 1].body : "None"
        };
    },

    /**
     * 🔍 searchGlobal
     * Smart Search across Collections. 
     * Handles "Find Rohit" or "Order #1234"
     */
    searchGlobal: async (args, { permissions }) => {
        const { query } = args;
        const results = [];

        // Is it an Order ID?
        if (!isNaN(query)) {
            const orderSnap = await db.collection('orders').where('orderNumber', '==', Number(query)).get();
            if (!orderSnap.empty) results.push({ type: 'ORDER', data: orderSnap.docs[0].data() });
        }

        // Is it a Name? Search Orders (Case sensitive usually, require exact match or assume exact)
        // Note: Firestore lacks native fuzzy search. We use inequality scan for "starts with"
        const nameSnap = await db.collection('orders')
            .where('customerName', '>=', query)
            .where('customerName', '<=', query + '\uf8ff')
            .limit(5).get();

        nameSnap.forEach(doc => results.push({ type: 'CUSTOMER_ORDER', data: doc.data() }));

        // Is it a Campaign?
        if (permissions.includes('access_campaigns')) {
            const campSnap = await db.collection('campaigns')
                .where('name', '>=', query)
                .where('name', '<=', query + '\uf8ff')
                .limit(3).get();
            campSnap.forEach(doc => results.push({ type: 'CAMPAIGN', data: doc.data() }));
        }

        return {
            match_count: results.length,
            results: results
        };
    },

    // --- Legacy Low-Level Access (for ad-hoc queries) ---
    queryFirestore: async (args, { permissions, isAdmin }) => {
        const { collection, filters, limit = 10, orderBy } = args;
        // Basic permission mapping check (simplified)
        const accessMap = {
            'orders': 'access_orders', 'checkouts': 'access_orders',
            'wallet_transactions': 'access_wallet', 'campaigns': 'access_campaigns',
            'whatsapp_messages': 'access_whatsapp', 'users': 'ADMIN', 'system': 'ADMIN'
        };
        const needed = accessMap[collection];
        if (!isAdmin && (!needed || !permissions.includes(needed))) throw new Error("Access Denied");

        let ref = db.collection(collection);
        if (filters && Array.isArray(filters)) {
            for (const [f, op, v] of filters) ref = ref.where(f, op, v);
        }
        if (orderBy) ref = ref.orderBy(orderBy[0], orderBy[1] || 'desc');
        const snap = await ref.limit(limit).get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
};

// ---------------------------------------------------------
// 5. TOOL DEFINITIONS (Gemini Spec)
// ---------------------------------------------------------
const GEMINI_TOOLS_DEF = [{
    functionDeclarations: [
        {
            name: "getFinancialReport",
            description: "Get Income, Expense, and Net Profit for a date range. Accurate for money questions.",
            parametersJsonSchema: {
                type: "object",
                properties: {
                    startDate: { type: "string", description: "YYYY-MM-DD" },
                    endDate: { type: "string", description: "YYYY-MM-DD" },
                    category: { type: "string", description: "Optional category filter" }
                },
                required: ["startDate", "endDate"]
            }
        },
        {
            name: "getCustomer360",
            description: "Get full profile (LTV, orders, carts) of a customer by Phone Number.",
            parametersJsonSchema: {
                type: "object",
                properties: { phone: { type: "string" } },
                required: ["phone"]
            }
        },
        {
            name: "searchGlobal",
            description: "Search for Orders, Customers, or Campaigns by Name or ID.",
            parametersJsonSchema: {
                type: "object",
                properties: { query: { type: "string" } },
                required: ["query"]
            }
        },
        {
            name: "queryFirestore",
            description: "Fallback: Direct database query for specific lists not covered by other tools.",
            parametersJsonSchema: {
                type: "object",
                properties: {
                    collection: { type: "string" },
                    filters: { type: "array" },
                    limit: { type: "number" },
                    orderBy: { type: "array" }
                },
                required: ["collection"]
            }
        }
    ]
}];

// ---------------------------------------------------------
// 6. MAIN HANDLER
// ---------------------------------------------------------
module.exports = async (req, res) => {
    await new Promise(resolve => cors(req, res, resolve));
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (!ai) return res.status(500).json({ error: 'System configuration error' });

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
        const token = authHeader.split('Bearer ')[1];
        const decoded = await admin.auth().verifyIdToken(token);

        // Fetch Admin Status
        const userDoc = await db.collection('users').doc(decoded.uid).get();
        const userData = userDoc.data() || {};
        const userContext = {
            uid: decoded.uid,
            isAdmin: userData.role === 'admin',
            permissions: userData.permissions || []
        };

        const { prompt, history = [] } = req.body;
        const dateCtx = getDateContext();

        // 🧠 SENIOR ANALYST PROMPT
        const SYSTEM_PROMPT = `You are 'Sidekick Pro', a Senior E-commerce Analyst.

🌍 **Temporal Awareness (IST)**:
- Today: ${dateCtx.today} | Yesterday: ${dateCtx.yesterday}
- Context: You operate in Indian Standard Time (IST).

🛠️ **Strategic Playbooks**:
1. **Profitability Analysis**:
   - Use \`getFinancialReport\`. 
   - Always report "Net Profit". If negative, flag it with 🔴.
   
2. **Customer Support / Lookup**:
   - Use \`getCustomer360\` if searched by Phone.
   - Use \`searchGlobal\` if searched by Name or ID.
   - Report: "Lifetime Value (LTV)" and "Start Date".

3. **Performance Audit**:
   - Calculate ROAS = (Campaign Revenue / Spend).
   - Good ROAS is > 4.0. Bad is < 2.0.

4. **Formatting**:
   - Use structured, professional summaries.
   - 🚫 No Raw JSON. 🚫 No Markdown Code Blocks.
   
Your goal is to provide **Actionable Business Intelligence**, not just data rows.`;

        // Execution Logic (Standard Agent Loop)
        const chatHistory = [
            ...history.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
            { role: 'user', parts: [{ text: prompt }] }
        ];

        let response = await ai.models.generateContent({
            model: 'gemini-2.0-flash-exp',
            contents: chatHistory,
            config: { systemInstruction: SYSTEM_PROMPT, tools: GEMINI_TOOLS_DEF }
        });

        // Loop for multi-step reasoning
        let depth = 0;
        while (response.functionCalls?.length > 0 && depth < 5) {
            depth++;
            const call = response.functionCalls[0];
            const ToolFunction = DATA_TOOLS[call.name];

            let result;
            try {
                if (ToolFunction) {
                    console.log(`[AI-Ops] Executing ${call.name}`);
                    result = await ToolFunction(call.args, userContext);
                } else {
                    result = { error: `Tool ${call.name} not available` };
                }
            } catch (err) {
                console.error(`[AI-Ops] Tool Error: ${err.message}`);
                result = { error: err.message };
            }

            chatHistory.push({ role: 'model', parts: [{ functionCall: call }] });
            chatHistory.push({ role: 'user', parts: [{ functionResponse: { name: call.name, response: { result } } }] });

            response = await ai.models.generateContent({
                model: 'gemini-2.0-flash-exp',
                contents: chatHistory,
                config: { systemInstruction: SYSTEM_PROMPT, tools: GEMINI_TOOLS_DEF }
            });
        }

        res.json({ text: response.text });

    } catch (error) {
        console.error('API Critical Failure:', error);
        res.status(500).json({ error: error.message });
    }
};
