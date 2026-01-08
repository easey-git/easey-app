const axios = require('axios');
const cors = require('cors')({ origin: true });

const runMiddleware = (req, res, fn) => {
    return new Promise((resolve, reject) => {
        fn(req, res, (result) => {
            if (result instanceof Error) return reject(result);
            return resolve(result);
        });
    });
};

/**
 * Pixel & Conversion Tracking API
 * 
 * Features:
 * - List all pixels
 * - Pixel event statistics
 * - Conversion tracking
 * - Custom conversions
 * - Event source groups
 * - Pixel health and diagnostics
 */

module.exports = async (req, res) => {
    await runMiddleware(req, res, cors);

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
        const adAccountId = process.env.AD_ACCOUNT_ID;

        if (!accessToken || !adAccountId) {
            return res.status(500).json({ error: 'Meta API not configured' });
        }

        const cleanAdAccountId = adAccountId.replace(/^act_/, '');
        const baseUrl = `https://graph.facebook.com/v21.0/act_${cleanAdAccountId}`;

        const { pixelId, since, until } = req.query;

        // If specific pixel requested, get detailed stats
        if (pixelId) {
            return await getPixelDetails(pixelId, accessToken, since, until, res);
        }

        // Otherwise, list all pixels
        const pixelsResponse = await axios.get(`${baseUrl}/adspixels`, {
            params: {
                access_token: accessToken,
                fields: [
                    'id',
                    'name',
                    'code',
                    'creation_time',
                    'last_fired_time',
                    'is_created_by_business',
                    'is_unavailable',
                    'owner_ad_account',
                    'owner_business'
                ].join(',')
            }
        });

        const pixels = pixelsResponse.data.data || [];

        // Get custom conversions
        const conversionsResponse = await axios.get(`${baseUrl}/customconversions`, {
            params: {
                access_token: accessToken,
                fields: [
                    'id',
                    'name',
                    'custom_event_type',
                    'rule',
                    'creation_time',
                    'is_archived',
                    'pixel'
                ].join(',')
            }
        });

        const customConversions = conversionsResponse.data.data || [];

        // Process pixels with basic stats
        const processedPixels = await Promise.all(pixels.map(async (pixel) => {
            let stats = null;

            // Try to get recent stats for each pixel
            try {
                const statsResponse = await axios.get(`https://graph.facebook.com/v21.0/${pixel.id}/stats`, {
                    params: {
                        access_token: accessToken,
                        start_time: since || getDateDaysAgo(7),
                        end_time: until || getDateDaysAgo(0)
                    }
                });

                stats = statsResponse.data.data?.[0] || null;
            } catch (err) {
                console.log(`Stats not available for pixel ${pixel.id}`);
            }

            return {
                id: pixel.id,
                name: pixel.name,
                createdTime: pixel.creation_time,
                lastFiredTime: pixel.last_fired_time,
                isActive: !pixel.is_unavailable,
                ownerAccount: pixel.owner_ad_account?.id || null,
                ownerBusiness: pixel.owner_business?.id || null,
                stats: stats ? {
                    count: stats.count || 0,
                    value: stats.value || 0
                } : null
            };
        }));

        // Process custom conversions
        const processedConversions = customConversions.map(conv => ({
            id: conv.id,
            name: conv.name,
            eventType: conv.custom_event_type,
            rule: conv.rule,
            pixelId: conv.pixel?.id || null,
            isArchived: conv.is_archived,
            createdTime: conv.creation_time
        }));

        return res.status(200).json({
            pixels: processedPixels,
            customConversions: processedConversions,
            summary: {
                totalPixels: processedPixels.length,
                activePixels: processedPixels.filter(p => p.isActive).length,
                totalConversions: processedConversions.length,
                activeConversions: processedConversions.filter(c => !c.isArchived).length
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Pixel Tracking Error:', JSON.stringify(error.response?.data || error.message, null, 2));
        return res.status(500).json({
            error: error.response?.data?.error?.message || error.message,
            details: error.response?.data || null
        });
    }
};

// Get detailed pixel statistics
async function getPixelDetails(pixelId, accessToken, since, until, res) {
    const pixelUrl = `https://graph.facebook.com/v21.0/${pixelId}`;

    // Get pixel info
    const pixelResponse = await axios.get(pixelUrl, {
        params: {
            access_token: accessToken,
            fields: [
                'id',
                'name',
                'code',
                'creation_time',
                'last_fired_time',
                'is_created_by_business',
                'is_unavailable',
                'owner_ad_account',
                'owner_business'
            ].join(',')
        }
    });

    const pixel = pixelResponse.data;

    // Get event stats
    let eventStats = [];
    try {
        const statsResponse = await axios.get(`${pixelUrl}/stats`, {
            params: {
                access_token: accessToken,
                start_time: since || getDateDaysAgo(7),
                end_time: until || getDateDaysAgo(0),
                aggregation: 'event'
            }
        });

        eventStats = statsResponse.data.data || [];
    } catch (err) {
        console.log('Event stats not available');
    }

    // Get server events (if available)
    let serverEvents = [];
    try {
        const serverEventsResponse = await axios.get(`${pixelUrl}/server_events`, {
            params: {
                access_token: accessToken,
                limit: 50
            }
        });

        serverEvents = serverEventsResponse.data.data || [];
    } catch (err) {
        console.log('Server events not available');
    }

    // Process event stats by type
    const eventsByType = {};
    eventStats.forEach(stat => {
        const eventName = stat.event_name || 'Unknown';
        if (!eventsByType[eventName]) {
            eventsByType[eventName] = {
                count: 0,
                value: 0
            };
        }
        eventsByType[eventName].count += parseInt(stat.count || 0);
        eventsByType[eventName].value += parseFloat(stat.value || 0);
    });

    // Calculate event health
    const standardEvents = ['PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout', 'Purchase'];
    const detectedEvents = Object.keys(eventsByType);
    const eventHealth = {
        standardEventsDetected: standardEvents.filter(e => detectedEvents.includes(e)),
        customEventsDetected: detectedEvents.filter(e => !standardEvents.includes(e)),
        totalEvents: detectedEvents.length,
        healthScore: calculatePixelHealth(eventsByType, standardEvents)
    };

    return res.status(200).json({
        pixel: {
            id: pixel.id,
            name: pixel.name,
            code: pixel.code,
            createdTime: pixel.creation_time,
            lastFiredTime: pixel.last_fired_time,
            isActive: !pixel.is_unavailable,
            ownerAccount: pixel.owner_ad_account?.id || null,
            ownerBusiness: pixel.owner_business?.id || null
        },
        events: eventsByType,
        eventHealth: eventHealth,
        recentServerEvents: serverEvents.slice(0, 10).map(event => ({
            eventName: event.event_name,
            eventTime: event.event_time,
            eventSourceUrl: event.event_source_url,
            userData: event.user_data ? 'Present' : 'None'
        })),
        period: {
            since: since || getDateDaysAgo(7),
            until: until || getDateDaysAgo(0)
        },
        timestamp: new Date().toISOString()
    });
}

// Calculate pixel health score (0-100)
function calculatePixelHealth(eventsByType, standardEvents) {
    let score = 0;

    // Base score for having events
    if (Object.keys(eventsByType).length > 0) {
        score += 20;
    }

    // Score for standard events
    const detectedStandardEvents = standardEvents.filter(e => eventsByType[e]);
    score += (detectedStandardEvents.length / standardEvents.length) * 50;

    // Score for purchase events
    if (eventsByType['Purchase'] && eventsByType['Purchase'].count > 0) {
        score += 20;
    }

    // Score for funnel completeness
    const funnelEvents = ['ViewContent', 'AddToCart', 'InitiateCheckout', 'Purchase'];
    const funnelComplete = funnelEvents.every(e => eventsByType[e]);
    if (funnelComplete) {
        score += 10;
    }

    return Math.min(100, Math.round(score));
}

// Helper: Get date N days ago in Unix timestamp
function getDateDaysAgo(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return Math.floor(date.getTime() / 1000);
}
