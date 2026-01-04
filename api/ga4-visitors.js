const { BetaAnalyticsDataClient } = require('@google-analytics/data');
const cors = require('cors')({ origin: true });

// Helper to run middleware
const runMiddleware = (req, res, fn) => {
    return new Promise((resolve, reject) => {
        fn(req, res, (result) => {
            if (result instanceof Error) return reject(result);
            return resolve(result);
        });
    });
};

/**
 * GA4 Active Visitors API
 * Fetches real-time active visitors from Google Analytics 4
 * Returns total count and detailed breakdown by location and device
 */

module.exports = async (req, res) => {
    // Handle CORS
    await runMiddleware(req, res, cors);

    // Handle OPTIONS request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Only allow GET requests
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Validate environment variables
        const propertyId = process.env.GA4_PROPERTY_ID;

        if (!propertyId) {
            console.error('GA4 Configuration Error: Missing GA4_PROPERTY_ID');
            return res.status(500).json({
                error: 'GA4 not configured - missing property ID',
                activeVisitors: 0
            });
        }

        // Support both credential formats:
        // 1. New format: Single GA4_CREDENTIALS JSON
        // 2. Legacy format: Individual environment variables
        let credentialsJson;

        if (process.env.GA4_CREDENTIALS) {
            try {
                credentialsJson = JSON.parse(process.env.GA4_CREDENTIALS);
            } catch (parseError) {
                console.error('GA4 Credentials Parse Error:', parseError);
                return res.status(500).json({
                    error: 'Invalid GA4 credentials format',
                    activeVisitors: 0
                });
            }
        } else if (process.env.GA4_PRIVATE_KEY && process.env.GA4_CLIENT_EMAIL) {
            credentialsJson = {
                type: 'service_account',
                project_id: process.env.GA4_PROJECT_ID,
                private_key_id: process.env.GA4_PRIVATE_KEY_ID,
                private_key: process.env.GA4_PRIVATE_KEY.replace(/\\n/g, '\n'),
                client_email: process.env.GA4_CLIENT_EMAIL,
                client_id: process.env.GA4_CLIENT_ID,
                auth_uri: 'https://accounts.google.com/o/oauth2/auth',
                token_uri: 'https://oauth2.googleapis.com/token',
                auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
                client_x509_cert_url: process.env.GA4_CLIENT_CERT_URL
            };
        } else {
            console.error('GA4 Configuration Error: Missing credentials');
            return res.status(500).json({
                error: 'GA4 not configured - missing credentials',
                activeVisitors: 0
            });
        }

        // Initialize GA4 client
        const analyticsDataClient = new BetaAnalyticsDataClient({
            credentials: credentialsJson
        });

        // Run realtime report with dimensions
        const [response] = await analyticsDataClient.runRealtimeReport({
            property: `properties/${propertyId}`,
            dimensions: [
                { name: 'city' },
                { name: 'country' },
                { name: 'deviceCategory' }
            ],
            metrics: [
                { name: 'activeUsers' },
            ],
        });

        // Process rows to calculate total and get breakdown (Standard 30-min Window)
        let totalActive = 0;
        const details = [];

        if (response.rows) {
            response.rows.forEach(row => {
                const city = row.dimensionValues[0].value;
                const country = row.dimensionValues[1].value;
                const device = row.dimensionValues[2].value;
                const count = parseInt(row.metricValues[0].value, 10);

                totalActive += count;

                details.push({
                    city,
                    country,
                    device,
                    count
                });
            });
        }

        // Sort details by count desc
        details.sort((a, b) => b.count - a.count);

        return res.status(200).json({
            activeVisitors: totalActive,
            details: details,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('GA4 API Error:', error.message);

        // Return graceful error response
        return res.status(500).json({
            error: error.message || 'Failed to fetch GA4 data',
            activeVisitors: 0,
            timestamp: new Date().toISOString()
        });
    }
};
