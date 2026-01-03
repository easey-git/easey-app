const { GoogleGenAI } = require("@google/genai");
const admin = require("firebase-admin");
const { BetaAnalyticsDataClient } = require('@google-analytics/data');

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
You have access to a live database and external APIs for an e-commerce store.

DATA SOURCES:

1.  **ORDERS** (Collection: "orders")
    - Fields: orderNumber (number), customerName, totalPrice, status ('COD', 'Paid', 'CANCELLED'), phoneNormalized.
    - queryFirestore usage: collection='orders'

2.  **ABANDONED CARTS** (Collection: "checkouts")
    - Fields: total_price (number), first_name, eventType ('ABANDONED'), updatedAt.
    - queryFirestore usage: collection='checkouts'

3.  **WHATSAPP** (Collection: "whatsapp_messages")
    - Fields: phone, direction ('inbound', 'outbound'), body, status, timestamp.
    - queryFirestore usage: collection='whatsapp_messages'

4.  **WALLET / FINANCES** (Collection: "wallet_transactions")
    - Fields: amount (number), description (string), category (string), type ('income'|'expense'), date (timestamp).
    - queryFirestore usage: collection='wallet_transactions'

5.  **NOTES** (Collection: "notes")
    - Fields: title, body, createdAt, updatedAt.
    - queryFirestore usage: collection='notes'

6.  **NOTEBOOK / SCRATCHPAD** (Doc: "dashboard/notes")
    - Single document containing a quick scratchpad.
    - queryFirestore usage: collection='dashboard' (then look for id 'notes' or just search).

7.  **VISITORS / ANALYTICS** (Tool: fetchAnalytics)
    - Real-time active users on the site right now.

8.  **MARKETING CAMPAIGNS** (Tool: fetchCampaigns)
    - Facebook Ads performance for TODAY.
    - Data: Spend, Revenue, ROAS, Purchases, Impressions, Clicks.

SEARCH TIPS:
- For 'orderNumber', always query as a NUMBER.
- For financial summaries, query 'wallet_transactions' and sum them up yourself or ask for the last N transactions.
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

        const l = limit || 10;
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

const fetchAnalytics = async () => {
    try {
        if (!process.env.GA4_PROPERTY_ID) return "Analytics not configured.";

        const credentials = {
            type: 'service_account',
            project_id: process.env.GA4_PROJECT_ID,
            private_key_id: process.env.GA4_PRIVATE_KEY_ID,
            private_key: process.env.GA4_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            client_email: process.env.GA4_CLIENT_EMAIL,
            client_id: process.env.GA4_CLIENT_ID,
        };

        const analyticsDataClient = new BetaAnalyticsDataClient({ credentials });
        const [response] = await analyticsDataClient.runRealtimeReport({
            property: \`properties/\${process.env.GA4_PROPERTY_ID}\`,
            minuteRanges: [{ name: 'last5Minutes', startMinutesAgo: 4, endMinutesAgo: 0 }],
            metrics: [{ name: 'activeUsers' }],
        });

        const activeUsers = parseInt(response.rows?.[0]?.metricValues?.[0]?.value || '0', 10);
        return { activeVisitors: activeUsers, source: 'GA4 Realtime' };
    } catch (error) {
        return { error: "Failed to fetch analytics", details: error.message };
    }
};

const fetchCampaigns = async () => {
    try {
        const { FACEBOOK_ACCESS_TOKEN, AD_ACCOUNT_ID } = process.env;
        if (!FACEBOOK_ACCESS_TOKEN || !AD_ACCOUNT_ID) return "Marketing API not configured.";

        const url = new URL(\`https://graph.facebook.com/v21.0/\${AD_ACCOUNT_ID}/insights\`);
        url.searchParams.set('level', 'campaign');
        url.searchParams.set('date_preset', 'today');
        url.searchParams.set('fields', 'campaign_id,campaign_name,spend,purchase_roas,actions,clicks');
        url.searchParams.set('access_token', FACEBOOK_ACCESS_TOKEN);

        const response = await fetch(url.toString());
        const data = await response.json();

        if (data.error) return { error: data.error.message };

        return (data.data || []).map(c => ({
            name: c.campaign_name,
            spend: c.spend,
            roas: c.purchase_roas?.[0]?.value || 0,
            purchases: c.actions?.find(a => a.action_type === 'purchase')?.value || 0,
            clicks: c.clicks,
            period: 'Today'
        }));
    } catch (error) {
        return { error: "Failed to fetch campaigns", details: error.message };
    }
};

// ---------------------------------------------------------
// MAIN HANDLER
// ---------------------------------------------------------
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const { prompt, history = [] } = req.body;
        if (!process.env.GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY");

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

        // Tool Definitions
        const queryTimestampDesc = {
            name: 'queryFirestore',
            description: "Fetch specific records from the database (orders, wallet, notes, etc).",
            parametersJsonSchema: {
                type: 'object',
                properties: {
                    collection: { type: 'string', description: "Collection name: 'orders', 'checkouts', 'whatsapp_messages', 'wallet_transactions', 'notes', 'dashboard'" },
                    filters: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
                    limit: { type: 'number' },
                    orderBy: { type: 'array', items: { type: 'string' } }
                },
                required: ['collection'],
            },
        };

        const fetchAnalyticsDesc = {
            name: 'fetchAnalytics',
            description: "Get real-time active visitor count from Google Analytics.",
            parametersJsonSchema: { type: 'object', properties: {} },
        };

        const fetchCampaignsDesc = {
            name: 'fetchCampaigns',
            description: "Get today's Facebook Ad performance (Spend, ROAS, Purchases).",
            parametersJsonSchema: { type: 'object', properties: {} },
        };

        const config = {
            tools: [{ functionDeclarations: [queryTimestampDesc, fetchAnalyticsDesc, fetchCampaignsDesc] }],
        };

        // Construct History Prompt
        let historyPrompt = "";
        if (history && history.length > 0) {
            historyPrompt = history.map(h => \`\${h.role === 'user' ? 'User' : 'Easey'}: \${h.text}\`).join("\\n");
        }

        const fullPrompt = \`\${DB_SCHEMA}

CONTEXT OF CONVERSATION:
\${historyPrompt}

CURRENT QUERY:
User: \${prompt}
Easey:\`;

        // 1. First Turn
        const response1 = await ai.models.generateContent({
            model: 'gemini-2.0-flash-exp',
            contents: fullPrompt,
            config: config
        });

        const candidates = response1.candidates;
        if (!candidates || candidates.length === 0) return res.status(200).json({ text: "No response." });

        const firstCand = candidates[0];
        const content = firstCand.content;
        const parts = content.parts;
        const functionCalls = parts ? parts.filter(p => p.functionCall) : [];

        if (functionCalls.length > 0) {
            const toolOutputs = [];

            for (const part of functionCalls) {
                const call = part.functionCall;
                let result;

                if (call.name === 'queryFirestore') result = await queryFirestore(call.args);
                else if (call.name === 'fetchAnalytics') result = await fetchAnalytics();
                else if (call.name === 'fetchCampaigns') result = await fetchCampaigns();

                toolOutputs.push({
                    functionResponse: {
                        name: call.name,
                        response: { result: result }
                    }
                });
            }

            const historyContents = [
                { role: 'user', parts: [{ text: fullPrompt }] },
                { role: 'model', parts: parts }
            ];

            const toolMessage = { role: 'user', parts: toolOutputs };

            const response2 = await ai.models.generateContent({
                model: 'gemini-2.0-flash-exp',
                contents: [...historyContents, toolMessage],
                config: config
            });

            return res.status(200).json({
                text: response2.text,
                data: toolOutputs[0].functionResponse.response.result
            });

        } else {
            return res.status(200).json({ text: response1.text });
        }

    } catch (error) {
        console.error("Assistant Error:", error);
        res.status(500).json({ error: error.message });
    }
};
