import { LOGISTICS_TOKENS, LOGISTICS_URLS } from '../config/logistics';

export const fetchDelhiveryOrders = async (status = 'All', page = 1) => {
    try {
        const token = LOGISTICS_TOKENS.DELHIVERY_JWT; // Use the internal JWT
        if (!token) throw new Error("Delhivery Token not found");

        const payload = {
            "search_on": ["wbn"],
            "search_type": "CONTAINS",
            "search_term": "",
            "page_size": 1000,
            "page": page,
            "only_count": false,
            "filter_only_master_wbn": true,
            "filter_shipment_type": ["FORWARD"],
            "sorting": [{ "field": "manifested_at", "direction": "DESC" }]
        };

        const response = await fetch(LOGISTICS_URLS.DELHIVERY_INTERNAL_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                token: token,
                payload: payload
            })
        });

        if (!response.ok) {
            try {
                const err = await response.json();
                console.error("DEBUG: Delhivery Proxy Failed:", response.status, JSON.stringify(err));

                // If 401 Unauthorized, attempt to Auto-Refresh Token
                if (response.status === 401) {
                    console.log("Attempting Auto-Refresh of Delhivery Token...");

                    const refreshRes = await fetch('https://easey-app.vercel.app/api/auth-delhivery', {
                        method: 'POST',
                    }); // Takes 30s+

                    if (refreshRes.ok) {
                        const refreshData = await refreshRes.json();
                        if (refreshData.token) {
                            console.log("Token Refreshed Successfully!");
                            // Update the token in memory for this session
                            LOGISTICS_TOKENS.DELHIVERY_JWT = refreshData.token.replace('Bearer ', '');

                            // Retry the Original Request with new token
                            // Recursive call with same params
                            return fetchDelhiveryOrders(status, page);
                        }
                    } else {
                        console.error("Token Refresh Failed:", await refreshRes.text());
                    }
                }

            } catch (e) {
                console.error("DEBUG: Delhivery Proxy Failed (non-JSON):", response.status);
            }
            return null;
        }

        const data = await response.json();
        console.log("Delhivery Internal API Response:", JSON.stringify(data).slice(0, 500)); // Log part of response to debug

        // The previous "data.packages" was for the public API. 
        // We will need to see what `data` contains now and map it later.
        // For now, return raw data so we can inspect it in the View logs.
        return data;

    } catch (error) {
        console.error("Error fetching Delhivery orders:", error);
        return null;
    }
};

export const syncDelhiveryStatus = async (awb) => {
    // Used to update a specific order
    // ...
};
