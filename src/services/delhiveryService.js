import { LOGISTICS_TOKENS, LOGISTICS_URLS } from '../config/logistics';

export const fetchDelhiveryOrders = async (status = 'All', page = 1) => {
    try {
        const token = LOGISTICS_TOKENS.DELHIVERY_JWT; // Use the internal JWT
        if (!token) throw new Error("Delhivery Token not found");

        const payload = {
            "search_on": ["wbn"],
            "search_type": "CONTAINS",
            "search_term": "",
            "page_size": 50,
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
            console.warn("Delhivery API List call failed, status:", response.status);
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
