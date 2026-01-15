// Serverless function to proxy Delhivery requests with correct headers
export default async function handler(req, res) {
    // Enable CORS for this function
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const { token, payload } = req.body;

        if (!token) {
            return res.status(400).json({ error: "Missing token in request body" });
        }

        const response = await fetch("https://ucp-app-gateway.delhivery.com/web/api/forward_orders/hq_es_shipments_search/list", {
            method: 'POST',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'accept-language': 'en',
                'authorization': `Bearer ${token}`,
                'content-type': 'application/json',
                'origin': 'https://ucp.delhivery.com',
                'referer': 'https://ucp.delhivery.com/',
                'x-hq-client-id': 'cms::client::53f3d783-ca97-11f0-8d4f-061927e1202d',
                'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            console.error(`Delhivery Upstream Error: ${response.status} ${response.statusText}`);
            const text = await response.text();
            // Pass the upstream error back
            return res.status(response.status).send(text);
        }

        const data = await response.json();
        return res.status(200).json(data);

    } catch (error) {
        console.error("Proxy Error:", error);
        return res.status(500).json({ error: "Internal Proxy Error", details: error.message });
    }
}
