const { BetaAnalyticsDataClient } = require('@google-analytics/data');

/**
 * GA4 Active Visitors API
 * Fetches real-time active visitors from Google Analytics 4
 */

module.exports = async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

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
        // 2. Legacy format: Individual environment variables (your current setup)
        let credentialsJson;

        if (process.env.GA4_CREDENTIALS) {
            // New format: Parse single JSON credential
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
            // Legacy format: Build credentials from individual env vars
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

        // Run realtime report
        const [response] = await analyticsDataClient.runRealtimeReport({
            property: `properties/${propertyId}`,
            metrics: [
                {
                    name: 'activeUsers',
                },
            ],
        });

        // Extract active visitors count
        const activeVisitors = response.rows?.[0]?.metricValues?.[0]?.value || '0';

        return res.status(200).json({
            activeVisitors: parseInt(activeVisitors, 10),
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
