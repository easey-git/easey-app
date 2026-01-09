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

// Concurrent request limiting (GA4 limit: 10, we use 8 for safety)
let activeRequests = 0;
const MAX_CONCURRENT_REQUESTS = 8;

// Error rate tracking
let errorCount = 0;
let errorResetTime = Date.now();

/**
 * GA4 Comprehensive Real-time Analytics API
 * 
 * Fetches complete real-time analytics from Google Analytics 4:
 * - User metrics (active users, new users, engagement)
 * - Traffic sources (where visitors come from)
 * - Geographic breakdown (countries, cities)
 * - Device breakdown (desktop, mobile, tablet)
 * - E-commerce metrics (purchases, revenue, cart adds)
 * - Content metrics (page views, top pages)
 * - Quota monitoring and error tracking
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

    // Wait if too many concurrent requests
    while (activeRequests >= MAX_CONCURRENT_REQUESTS) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    activeRequests++;

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

        // Support both credential formats
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

        // Fetch multiple reports in parallel for comprehensive analytics
        const [
            overviewResponse,
            trafficSourceResponse,
            deviceResponse,
            geoResponse,
            contentResponse,
            eventResponse,
            techResponse
        ] = await Promise.all([
            // 1. Overview Metrics (Simplified to compatible metrics)
            analyticsDataClient.runRealtimeReport({
                property: `properties/${propertyId}`,
                metrics: [
                    { name: 'activeUsers' },
                    { name: 'screenPageViews' },
                    { name: 'eventCount' }
                ],
                returnPropertyQuota: true // Enable quota monitoring
            }),

            // 2. Traffic Sources
            // NOTE: 'screenPageViews' is incompatible with session dimensions in Data API
            analyticsDataClient.runRealtimeReport({
                property: `properties/${propertyId}`,
                dimensions: [
                    { name: 'sessionSource' },
                    { name: 'sessionMedium' }
                ],
                metrics: [
                    { name: 'activeUsers' }
                ],
                limit: 10
            }),

            // 3. Device Breakdown
            analyticsDataClient.runRealtimeReport({
                property: `properties/${propertyId}`,
                dimensions: [
                    { name: 'deviceCategory' }
                ],
                metrics: [
                    { name: 'activeUsers' },
                    { name: 'screenPageViews' }
                ]
            }),

            // 4. Geographic Breakdown
            analyticsDataClient.runRealtimeReport({
                property: `properties/${propertyId}`,
                dimensions: [
                    { name: 'country' },
                    { name: 'city' }
                ],
                metrics: [
                    { name: 'activeUsers' }
                ],
                limit: 20
            }),

            // 5. Top Content
            analyticsDataClient.runRealtimeReport({
                property: `properties/${propertyId}`,
                dimensions: [
                    { name: 'unifiedScreenName' }
                ],
                metrics: [
                    { name: 'screenPageViews' },
                    { name: 'activeUsers' }
                ],
                limit: 10
            }),

            // 6. Top Events
            analyticsDataClient.runRealtimeReport({
                property: `properties/${propertyId}`,
                dimensions: [
                    { name: 'eventName' }
                ],
                metrics: [
                    { name: 'eventCount' }
                ],
                limit: 10
            }),

            // 7. Tech Specs (OS)
            analyticsDataClient.runRealtimeReport({
                property: `properties/${propertyId}`,
                dimensions: [
                    { name: 'operatingSystem' }
                ],
                metrics: [
                    { name: 'activeUsers' }
                ],
                limit: 5
            })
        ]);

        // Monitor quota usage (from first response)
        if (overviewResponse[0].propertyQuota) {
            const quota = overviewResponse[0].propertyQuota;

            if (quota.tokensPerDay) {
                const dailyUsage = (quota.tokensPerDay.consumed / (quota.tokensPerDay.consumed + quota.tokensPerDay.remaining)) * 100;
                if (dailyUsage > 80) {
                    console.warn(`[GA4 Warning] Daily quota at ${dailyUsage.toFixed(1)}%`);
                }
            }
        }

        // Process Overview Metrics
        const overviewData = overviewResponse[0];
        const activeUsers = overviewData.rows?.[0]?.metricValues[0]?.value || '0';
        const pageViews = overviewData.rows?.[0]?.metricValues[1]?.value || '0';
        const events = overviewData.rows?.[0]?.metricValues[2]?.value || '0';
        // const engagementDuration = overviewData.rows?.[0]?.metricValues[3]?.value || '0'; // Removed

        // Process Traffic Sources
        const trafficSources = [];
        if (trafficSourceResponse[0].rows) {
            trafficSourceResponse[0].rows.forEach(row => {
                const source = row.dimensionValues[0].value;
                const medium = row.dimensionValues[1].value;
                const users = parseInt(row.metricValues[0].value, 10);
                // pageViews removed from traffic report

                trafficSources.push({
                    source: source === '(direct)' ? 'Direct' : source,
                    medium: medium === '(none)' ? 'None' : medium,
                    users,
                    pageViews: 0 // Placeholder
                });
            });
        }
        trafficSources.sort((a, b) => b.users - a.users);

        // Process Device Breakdown
        const devices = {};
        if (deviceResponse[0].rows) {
            deviceResponse[0].rows.forEach(row => {
                const device = row.dimensionValues[0].value;
                const users = parseInt(row.metricValues[0].value, 10);
                const views = parseInt(row.metricValues[1].value, 10);

                devices[device] = { users, pageViews: views };
            });
        }

        // Process Geographic Data
        const locations = [];
        if (geoResponse[0].rows) {
            geoResponse[0].rows.forEach(row => {
                const country = row.dimensionValues[0].value;
                const city = row.dimensionValues[1].value;
                const users = parseInt(row.metricValues[0].value, 10);

                locations.push({ country, city, users });
            });
        }
        locations.sort((a, b) => b.users - a.users);

        // Process Top Content
        const topPages = [];
        if (contentResponse[0].rows) {
            contentResponse[0].rows.forEach(row => {
                const page = row.dimensionValues[0].value;
                const views = parseInt(row.metricValues[0].value, 10);
                const users = parseInt(row.metricValues[1].value, 10);

                topPages.push({ page, views, users });
            });
        }
        topPages.sort((a, b) => b.views - a.views);

        // Process Top Events
        const topEvents = [];
        if (eventResponse[0].rows) {
            eventResponse[0].rows.forEach(row => {
                const name = row.dimensionValues[0].value;
                const count = parseInt(row.metricValues[0].value, 10);
                topEvents.push({ name, count });
            });
        }
        topEvents.sort((a, b) => b.count - a.count);

        // Process Tech Specs (OS)
        const operatingSystems = [];
        if (techResponse[0].rows) {
            techResponse[0].rows.forEach(row => {
                const name = row.dimensionValues[0].value;
                const users = parseInt(row.metricValues[0].value, 10);
                operatingSystems.push({ name, users });
            });
        }
        operatingSystems.sort((a, b) => b.users - a.users);

        // Build comprehensive response
        const analytics = {
            // Overview
            overview: {
                activeUsers: parseInt(activeUsers),
                pageViews: parseInt(pageViews),
                events: parseInt(events),
                avgSessionDuration: 0 // Simplification as direct duration meta is flaky in realtime
            },

            // Traffic Sources
            trafficSources: trafficSources.slice(0, 5),

            // Devices
            devices: {
                desktop: devices.desktop?.users || 0,
                mobile: devices.mobile?.users || 0,
                tablet: devices.tablet?.users || 0
            },

            // Geographic
            locations: locations.slice(0, 10),

            // Top Content
            topPages: topPages.slice(0, 5),

            // User Behavior
            topEvents: topEvents.slice(0, 10),
            operatingSystems: operatingSystems,

            // Metadata
            timestamp: new Date().toISOString(),
            quotaStatus: overviewResponse[0].propertyQuota ? 'monitored' : 'not_available'
        };

        // Reset error count on success
        errorCount = 0;

        return res.status(200).json(analytics);

    } catch (error) {
        // Track errors
        errorCount++;

        // Reset counter every hour
        if (Date.now() - errorResetTime > 3600000) {
            errorCount = 0;
            errorResetTime = Date.now();
        }

        console.error('GA4 API Error Details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));

        // Return graceful error response with empty data
        return res.status(500).json({
            error: error.message || 'Failed to fetch GA4 data',
            overview: {
                activeUsers: 0,
                pageViews: 0,
                events: 0,
                avgSessionDuration: 0
            },
            trafficSources: [],
            devices: { desktop: 0, mobile: 0, tablet: 0 },
            locations: [],
            topPages: [],
            topEvents: [],
            operatingSystems: [],
            timestamp: new Date().toISOString()
        });
    } finally {
        activeRequests--;
    }
};
