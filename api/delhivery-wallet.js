export default async function handler(req, res) {
    const origin = req.headers.origin || '*';
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const { token, endpoint, params } = req.body;

        if (!token) {
            return res.status(400).json({ error: "Missing token" });
        }

        // Construct Delhivery API URL
        const baseUrl = "https://ucp-app-gateway.delhivery.com/web/api/wallet/";
        // Safe URL construction
        const urlObj = new URL(endpoint, baseUrl);

        if (params) {
            Object.keys(params).forEach(key => {
                if (params[key] !== undefined && params[key] !== null) {
                    urlObj.searchParams.append(key, params[key]);
                }
            });
        }

        const response = await fetch(urlObj.toString(), {
            method: 'GET',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'authorization': `Bearer ${token}`,
                'content-type': 'application/json',
                'origin': 'https://one.delhivery.com',
                'referer': 'https://one.delhivery.com/',
                'x-hq-client-id': 'cms::client::53f3d783-ca97-11f0-8d4f-061927e1202d',
                'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        if (!response.ok) {
            const text = await response.text();
            console.error(`Delhivery Wallet Error: ${response.status}`, text);
            return res.status(response.status).json({ error: text || response.statusText });
        }

        const data = await response.json();
        return res.status(200).json(data);

    } catch (error) {
        console.error("Wallet Proxy Error:", error);
        return res.status(500).json({ error: "Internal Proxy Error", details: error.message });
    }
}
