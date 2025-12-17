/**
 * Vercel Serverless Function
 * Fetches real-time active visitors from Google Analytics 4
 */

import { BetaAnalyticsDataClient } from '@google-analytics/data';

export default async function handler(req, res) {
    // Only allow GET requests
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Get credentials from environment variables
        const credentials = {
            type: 'service_account',
            project_id: process.env.GA4_PROJECT_ID,
            private_key_id: process.env.GA4_PRIVATE_KEY_ID,
            private_key: process.env.GA4_PRIVATE_KEY?.replace(/\\n/g, '\n'), // Fix newlines in private key
            client_email: process.env.GA4_CLIENT_EMAIL,
            client_id: process.env.GA4_CLIENT_ID,
            auth_uri: 'https://accounts.google.com/o/oauth2/auth',
            token_uri: 'https://oauth2.googleapis.com/token',
            auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
            client_x509_cert_url: process.env.GA4_CLIENT_CERT_URL,
            universe_domain: 'googleapis.com'
        };

        // Initialize GA4 client
        const analyticsDataClient = new BetaAnalyticsDataClient({
            credentials
        });

        // Get Property ID from environment
        const propertyId = process.env.GA4_PROPERTY_ID;

        if (!propertyId) {
            throw new Error('GA4_PROPERTY_ID not configured');
        }

        // Fetch real-time active users (last 5 minutes)
        const [response] = await analyticsDataClient.runRealtimeReport({
            property: `properties/${propertyId}`,
            minuteRanges: [
                {
                    name: 'last5Minutes',
                    startMinutesAgo: 4,  // 5 minutes ago (0-4 = 5 minutes)
                    endMinutesAgo: 0,     // Now
                },
            ],
            metrics: [
                {
                    name: 'activeUsers',
                },
            ],
        });

        // Extract active users count
        const activeUsers = parseInt(response.rows?.[0]?.metricValues?.[0]?.value || '0', 10);

        // Return the data
        return res.status(200).json({
            activeVisitors: activeUsers,
            timestamp: new Date().toISOString(),
            source: 'GA4'
        });

    } catch (error) {
        console.error('GA4 API Error:', error);

        return res.status(500).json({
            error: 'Failed to fetch GA4 data',
            message: error.message,
            activeVisitors: 0, // Fallback to 0
            source: 'error'
        });
    }
}
