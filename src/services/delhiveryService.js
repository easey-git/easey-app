import { Platform } from 'react-native';
import { LOGISTICS_TOKENS, LOGISTICS_URLS } from '../config/logistics';

// 1. Specific Proxy Request Wrapper for SHIPMENTS
const executeDelhiveryRequest = async (payload) => {
    const url = LOGISTICS_URLS.DELHIVERY_INTERNAL_URL;
    let token = LOGISTICS_TOKENS.DELHIVERY_JWT;

    const makeProxyCall = (t) => fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: t, payload })
    });

    let response = await makeProxyCall(token);

    if (response.status === 401) {
        if (__DEV__) console.log("Delhivery Proxy Token Expired. Attempting Refresh...");
        const refreshRes = await fetch('https://easey-app.vercel.app/api/auth-delhivery', { method: 'POST' });
        if (refreshRes.ok) {
            const d = await refreshRes.json();
            if (d.token) {
                LOGISTICS_TOKENS.DELHIVERY_JWT = d.token.replace('Bearer ', '');
                token = LOGISTICS_TOKENS.DELHIVERY_JWT;
                response = await makeProxyCall(token);
            }
        }
    }

    if (!response.ok) throw new Error(await response.text());
    return response.json();
};

// 2. Specific Proxy Request Wrapper for WALLET
// Uses the new api/delhivery-wallet.js endpoint to avoid CORS on Web
const executeDelhiveryWalletRequest = async (endpoint, params = {}) => {
    const url = LOGISTICS_URLS.DELHIVERY_WALLET_PROXY || 'https://easey-app.vercel.app/api/delhivery-wallet';
    let token = LOGISTICS_TOKENS.DELHIVERY_JWT;

    const makeProxyCall = (t) => fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: t, endpoint, params })
    });

    try {
        let response = await makeProxyCall(token);

        // Handle Token Expiry
        if (response.status === 401) {
            if (__DEV__) console.log("Delhivery Wallet Token Expired. Refreshing...");
            const refreshRes = await fetch('https://easey-app.vercel.app/api/auth-delhivery', { method: 'POST' });
            if (refreshRes.ok) {
                const d = await refreshRes.json();
                if (d.token) {
                    LOGISTICS_TOKENS.DELHIVERY_JWT = d.token.replace('Bearer ', '');
                    token = LOGISTICS_TOKENS.DELHIVERY_JWT;
                    response = await makeProxyCall(token);
                }
            }
        }

        if (!response.ok) {
            const text = await response.text();
            throw new Error(text || `Wallet API Error ${response.status}`);
        }

        const data = await response.json();
        if (__DEV__) {
            console.log(`[WalletAPI] ${endpoint} Response:`, JSON.stringify(data, null, 2));
        }
        return data;

    } catch (e) {
        console.error("Execute Wallet Request Error:", e);
        throw e;
    }
};

// --- LOGISTICS API ---

export const fetchDelhiveryOrders = async (status = 'All', page = 1) => {
    try {
        const PAGE_SIZE = 1000;
        let allResults = [];
        let currentPage = page;
        let keepFetching = true;
        const MAX_PAGES = 50;

        if (__DEV__) console.log("Fetching Delhivery Orders (Limitless Mode)...");

        while (keepFetching && currentPage <= MAX_PAGES) {
            const payload = {
                "search_on": ["wbn"],
                "search_type": "CONTAINS",
                "search_term": "",
                "page_size": PAGE_SIZE,
                "page": currentPage,
                "only_count": false,
                "filter_only_master_wbn": true,
                "filter_shipment_type": ["FORWARD"],
                "sorting": [{ "field": "manifested_at", "direction": "DESC" }]
            };

            const data = await executeDelhiveryRequest(payload);
            const results = data.results || (data.data?.packages) || [];
            allResults = [...allResults, ...results];

            if (__DEV__) console.log(`✓ fetched page ${currentPage}: ${results.length} items`);

            if (results.length < PAGE_SIZE) {
                keepFetching = false;
            } else {
                currentPage++;
            }
        }

        return { results: allResults };

    } catch (error) {
        console.error("Error fetching Delhivery orders:", error);
        return { results: [] };
    }
};

export const fetchDelhiveryNDR = async (page = 1) => {
    try {
        const PAGE_SIZE = 1000;
        let allResults = [];
        let currentPage = page;
        let keepFetching = true;
        const MAX_PAGES = 50;

        if (__DEV__) console.log("Fetching Delhivery NDR (Limitless Mode)...");

        while (keepFetching && currentPage <= MAX_PAGES) {
            const payload = {
                "search_on": ["wbn", "oid"],
                "search_type": "CONTAINS",
                "search_term": "",
                "page_size": PAGE_SIZE,
                "page": currentPage,
                "only_count": false,
                "filter_only_master_wbn": true,
                "filter_shipment_type": ["NDR_AND_NPR"],
                "range_dispatch_count": [{ "op": "GTE", "value": 1 }, { "op": "LTE", "value": null }],
                "sorting": [{ "field": "updated_at", "direction": "DESC" }]
            };

            const data = await executeDelhiveryRequest(payload);
            const results = data.results || data.data || [];
            allResults = [...allResults, ...results];

            if (__DEV__) console.log(`✓ fetched NDR page ${currentPage}: ${results.length} items`);

            if (results.length < PAGE_SIZE) {
                keepFetching = false;
            } else {
                currentPage++;
            }
        }

        return { results: allResults };

    } catch (error) {
        console.error("Error fetching NDR orders:", error);
        return { error: true, message: error.message };
    }
};

// --- WALLET API ---

// Fetches Balance and other wallet metadata
export const fetchDelhiveryWalletDetails = async () => {
    // URL: web/api/wallet/wallet_details
    try {
        return await executeDelhiveryWalletRequest("wallet_details");
    } catch (e) {
        console.error("Wallet Details Error:", e);
        return null; // Return null so UI shows error state/loading gracefully
    }
};

// Fetches Ledger/Statement
// Fetches Ledger/Statement
export const fetchDelhiveryTransactions = async (walletId, startDate, endDate, page = 1) => {
    // URL: web/api/wallet/transactions
    const params = {
        start_date: startDate, // YYYY-MM-DD
        end_date: endDate,     // YYYY-MM-DD
        page: page.toString(),
        page_size: '20'
    };

    if (walletId) {
        params.wallet_id = walletId;
    }

    try {
        return await executeDelhiveryWalletRequest("transactions", params);
    } catch (e) {
        console.error("Transactions Error:", e);
        return { count: 0, results: [] };
    }
};

// --- REMITTANCE API ---

export const fetchDelhiveryRemittances = async (page = 1, pageSize = 10) => {
    // URL: web/api/remittance/remittance_listing
    const params = {
        page: page.toString(),
        page_size: pageSize.toString()
    };

    try {
        // HACK: The backend proxy is hardcoded to base "web/api/wallet/".
        // We use "../" to traverse up and access "web/api/remittance/".
        return await executeDelhiveryWalletRequest("../remittance/remittance_listing", params);
    } catch (e) {
        console.error("Remittances Error:", e);
        return { count: 0, data: [] }; // Return empty structure
    }
};

export const syncDelhiveryStatus = async (awb) => {
    // Stub
};
