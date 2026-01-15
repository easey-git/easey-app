import { LOGISTICS_TOKENS, LOGISTICS_URLS } from '../config/logistics';

// Helper function to execute API calls with Token Refresh logic
const executeDelhiveryRequest = async (payload) => {
    let token = LOGISTICS_TOKENS.DELHIVERY_JWT;
    if (!token) throw new Error("Delhivery Token not found");

    const makeCall = async (t) => {
        return fetch(LOGISTICS_URLS.DELHIVERY_INTERNAL_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token: t,
                payload: payload
            })
        });
    };

    let response = await makeCall(token);

    // Handle Token Expiry
    if (response.status === 401) {
        console.log("Delhivery Token Expired. Attempting Auto-Refresh...");
        try {
            const refreshRes = await fetch('https://easey-app.vercel.app/api/auth-delhivery', {
                method: 'POST',
            });

            if (refreshRes.ok) {
                const refreshData = await refreshRes.json();
                if (refreshData.token) {
                    console.log("Token Refreshed Successfully!");
                    LOGISTICS_TOKENS.DELHIVERY_JWT = refreshData.token.replace('Bearer ', '');
                    token = LOGISTICS_TOKENS.DELHIVERY_JWT;
                    // Retry Request
                    response = await makeCall(token);
                }
            } else {
                console.error("Token Refresh Failed:", await refreshRes.text());
            }
        } catch (e) {
            console.error("Token Refresh Error:", e);
        }
    }

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`API Error ${response.status}: ${text}`);
    }

    return response.json();
};

export const fetchDelhiveryOrders = async (status = 'All', page = 1) => {
    try {
        const PAGE_SIZE = 1000;
        let allResults = [];
        let currentPage = page;
        let keepFetching = true;
        const MAX_PAGES = 50; // Safety cap (50k orders)

        console.log("Fetching Delhivery Orders (Limitless Mode)...");

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

            // Map/Safeguard results
            const results = data.results || (data.data?.packages) || [];
            allResults = [...allResults, ...results];

            console.log(` fetched page ${currentPage}: ${results.length} items`);

            // If we got fewer items than requested, we reached the end
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
        const PAGE_SIZE = 1000; // Increased from 50
        let allResults = [];
        let currentPage = page;
        let keepFetching = true;
        const MAX_PAGES = 50;

        console.log("Fetching Delhivery NDR (Limitless Mode)...");

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

            // API returns 'results' or 'data' fallback
            const results = data.results || data.data || [];
            allResults = [...allResults, ...results];

            console.log(` fetched NDR page ${currentPage}: ${results.length} items`);

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

export const syncDelhiveryStatus = async (awb) => {
    // Used to update a specific order
    // ...
};
