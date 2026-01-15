import { LOGISTICS_TOKENS, LOGISTICS_URLS } from '../config/logistics';

// Status mapping based on Delhivery "One" Portal Internal API
export const fetchDelhiveryOrders = async (status = 'Pending', page = 1) => {
    try {
        const token = LOGISTICS_TOKENS.DELHIVERY_JWT;
        if (!token) throw new Error("Delhivery Token not found");

        const STATUS_DEFINITIONS = {
            'Pending': ['MANIFESTED', 'PICKUP_SCHEDULED', 'Dispatched'],
            'Ready to Ship': ['MANIFESTED', 'PICKUP_SCHEDULED'],
            'Ready for Pickup': ['PICKUP_SCHEDULED', 'Ready for Pickup'],
            'In-Transit': ['SHIPPED', 'IN_TRANSIT'],
            'Out for Delivery': ['OUT_FOR_DELIVERY'],
            'Delivered': ['DELIVERED'],
            'RTO In-Transit': ['RTO_INITIATED', 'RETURN_PENDING'],
            'RTO-Returned': ['RETURNED_TO_ORIGIN'],
            'Cancelled': ['CANCELLED'],
            'Lost': ['LOST'],
            'All': []
        };

        const filterStatuses = STATUS_DEFINITIONS[status] || [];

        // Proper Payload Structure for "One" Portal
        const apiPayload = {
            "page_size": 20,
            "page": page,
            "filter_shipment_status": filterStatuses.length > 0 ? filterStatuses : undefined,
            "only_count": false
        };

        // We use the proxy to bypass CORS
        // We attempt to send the new Target URL to the proxy (if it supports it)
        const response = await fetch(LOGISTICS_URLS.DELHIVERY_INTERNAL_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                token: token,
                // Passing the specific internal URL directly to the proxy
                url: 'https://ucp-app-gateway.delhivery.com/web/api/forward_orders/shipments/ES/lists',
                payload: { payload: apiPayload } // The API expects { payload: { ... } }
            })
        });

        if (!response.ok) {
            console.error("Delhivery Proxy Failed:", response.status);
            // Auto-Refresh Logic (Generic)
            if (response.status === 401) {
                console.log("Attempting Auto-Refresh...");
                const refreshRes = await fetch('https://easey-app.vercel.app/api/auth-delhivery', { method: 'POST' });
                if (refreshRes.ok) {
                    const refreshData = await refreshRes.json();
                    if (refreshData.token) {
                        LOGISTICS_TOKENS.DELHIVERY_JWT = refreshData.token.replace('Bearer ', '');
                        return fetchDelhiveryOrders(status, page);
                    }
                }
            }
            return null;
        }

        const data = await response.json();
        // console.log("DEBUG: One Portal API Response:", JSON.stringify(data).slice(0, 500)); 

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
