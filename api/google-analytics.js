const { BetaAnalyticsDataClient } = require('@google-analytics/data');
const cors = require('cors')({ origin: true });

// Standardized middleware runner
const runMiddleware = (req, res, fn) => {
    return new Promise((resolve, reject) => {
        fn(req, res, (result) => {
            if (result instanceof Error) return reject(result);
            return resolve(result);
        });
    });
};

/**
 * Enterprise-Grade Google Analytics 4 API
 * Pattern: Facade / Aggregator
 * 
 * Provides a unified endpoint for comprehensive real-time analytics.
 * Handles authentication, quota management, and data transformation.
 */
module.exports = async (req, res) => {
    // 1. Security & Middleware
    await runMiddleware(req, res, cors);

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // 2. Configuration Validation
        const propertyId = process.env.GA4_PROPERTY_ID;
        if (!propertyId) throw new Error('Configuration Error: GA4_PROPERTY_ID is missing');

        // 3. Authentication Strategy (Service Account)
        const credentials = resolveCredentials();
        const client = new BetaAnalyticsDataClient({ credentials });

        // 4. Parallel Data Fetching
        // We fetch distinct dimensions independently to avoid API compatibility conflicts
        const [
            overview,
            devices,
            geo,
            pages,
            events
        ] = await Promise.all([
            fetchOverview(client, propertyId),
            fetchDevices(client, propertyId),
            fetchLocations(client, propertyId),
            fetchTopPages(client, propertyId),
            fetchTopEvents(client, propertyId)
        ]);

        // 5. Response Aggregation
        const responseData = {
            overview: {
                activeUsers: parseInt(overview.rows?.[0]?.metricValues?.[0]?.value || '0'),
                screenPageViews: parseInt(overview.rows?.[0]?.metricValues?.[1]?.value || '0'),
                eventCount: parseInt(overview.rows?.[0]?.metricValues?.[2]?.value || '0'),
            },
            devices: transformDevices(devices),
            locations: transformLocations(geo),
            topPages: transformPages(pages),
            topEvents: transformEvents(events),
            meta: {
                timestamp: new Date().toISOString(),
                quota: extractQuota(overview)
            }
        };

        return res.status(200).json(responseData);

    } catch (error) {
        console.error('[GA4 API Critical Failure]', error);
        return res.status(500).json({
            error: 'Analytics Service Unavailable',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
};

// --- DATA FETCHING STRATEGIES ---

async function fetchOverview(client, propertyId) {
    return client.runRealtimeReport({
        property: `properties/${propertyId}`,
        metrics: [
            { name: 'activeUsers' },
            { name: 'screenPageViews' },
            { name: 'eventCount' }
        ],
        returnPropertyQuota: true
    }).then(r => r[0]).catch(handlePartialError('Overview'));
}

async function fetchDevices(client, propertyId) {
    return client.runRealtimeReport({
        property: `properties/${propertyId}`,
        dimensions: [{ name: 'deviceCategory' }],
        metrics: [{ name: 'activeUsers' }]
    }).then(r => r[0]).catch(handlePartialError('Devices'));
}

async function fetchLocations(client, propertyId) {
    return client.runRealtimeReport({
        property: `properties/${propertyId}`,
        dimensions: [{ name: 'country' }, { name: 'city' }],
        metrics: [{ name: 'activeUsers' }],
        limit: 15
    }).then(r => r[0]).catch(handlePartialError('Locations'));
}

async function fetchTopPages(client, propertyId) {
    return client.runRealtimeReport({
        property: `properties/${propertyId}`,
        dimensions: [{ name: 'unifiedScreenName' }],
        metrics: [{ name: 'screenPageViews' }],
        limit: 10
    }).then(r => r[0]).catch(handlePartialError('Pages'));
}

async function fetchTopEvents(client, propertyId) {
    return client.runRealtimeReport({
        property: `properties/${propertyId}`,
        dimensions: [{ name: 'eventName' }],
        metrics: [{ name: 'eventCount' }],
        limit: 10
    }).then(r => r[0]).catch(handlePartialError('Events'));
}

// --- TRANSFORMERS ---

function transformDevices(response) {
    const map = { desktop: 0, mobile: 0, tablet: 0 };
    if (response?.rows) {
        response.rows.forEach(row => {
            const cat = row.dimensionValues[0].value.toLowerCase();
            map[cat] = parseInt(row.metricValues[0].value);
        });
    }
    return map;
}

function transformLocations(response) {
    if (!response?.rows) return [];
    return response.rows.map(row => ({
        country: row.dimensionValues[0].value,
        city: row.dimensionValues[1].value,
        users: parseInt(row.metricValues[0].value)
    })).sort((a, b) => b.users - a.users);
}

function transformPages(response) {
    if (!response?.rows) return [];
    return response.rows.map(row => ({
        page: row.dimensionValues[0].value,
        views: parseInt(row.metricValues[0].value),
        users: 0
    })).sort((a, b) => b.views - a.views);
}

function transformEvents(response) {
    if (!response?.rows) return [];
    return response.rows.map(row => ({
        name: row.dimensionValues[0].value,
        count: parseInt(row.metricValues[0].value)
    })).sort((a, b) => b.count - a.count);
}

function extractQuota(response) {
    if (!response?.propertyQuota) return 'unknown';
    const quota = response.propertyQuota;
    // Log warning if quota high
    if (quota.tokensPerDay) {
        const usage = quota.tokensPerDay.consumed / quota.tokensPerDay.remaining;
        if (usage > 0.8) console.warn('GA4 Daily Quota approaching limit');
    }
    return {
        daily: quota.tokensPerDay ? Math.round((quota.tokensPerDay.consumed / (quota.tokensPerDay.consumed + quota.tokensPerDay.remaining)) * 100) : 0,
        hourly: quota.tokensPerHour ? Math.round((quota.tokensPerHour.consumed / (quota.tokensPerHour.consumed + quota.tokensPerHour.remaining)) * 100) : 0
    };
}

// --- UTILITIES ---

function handlePartialError(reportName) {
    return (error) => {
        console.warn(`[GA4 Partial Failure] ${reportName} report failed:`, error.message);
        // Return empty structure to prevent crash
        return { rows: [] };
    };
}

function resolveCredentials() {
    if (process.env.GA4_CREDENTIALS) {
        return JSON.parse(process.env.GA4_CREDENTIALS);
    }
    if (process.env.GA4_PRIVATE_KEY && process.env.GA4_CLIENT_EMAIL) {
        return {
            client_email: process.env.GA4_CLIENT_EMAIL,
            private_key: process.env.GA4_PRIVATE_KEY.replace(/\\n/g, '\n'),
            project_id: process.env.GA4_PROJECT_ID,
        };
    }
    throw new Error('Credential Error: No valid GA4 credentials found in environment');
}
