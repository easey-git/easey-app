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
 * - Detailed pixel statistics (when pixelId is provided)
 * - Event tracking and health scoring
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
        let pixels = [];
        let customConversions = [];
        let permissionError = null;

        // Try to fetch pixels
        try {
            const pixelsResponse = await axios.get(`${baseUrl}/adspixels`, {
                params: {
                    access_token: accessToken,
                    fields: [
                        'id',
                        'name',
                        'creation_time',
                        'last_fired_time',
                        'is_unavailable'
                    ].join(',')
                }
            });

            pixels = pixelsResponse.data.data || [];
        } catch (error) {
            console.log('Pixels access denied:', error.response?.data?.error?.message);
            permissionError = {
                type: 'PIXELS_ACCESS_DENIED',
                message: 'Ad account owner has not granted pixel access. You need to be the account owner or have explicit permission.',
                code: error.response?.data?.error?.code
            };
        }

        // Try to fetch custom conversions
        try {
            const conversionsResponse = await axios.get(`${baseUrl}/customconversions`, {
                params: {
                    access_token: accessToken,
                    fields: [
                        'id',
                        'name',
                        'custom_event_type',
                        'creation_time',
                        'is_archived'
                    ].join(',')
                }
            });

            customConversions = conversionsResponse.data.data || [];
        } catch (error) {
            console.log('Custom conversions access denied:', error.response?.data?.error?.message);
            if (!permissionError) {
                permissionError = {
                    type: 'CONVERSIONS_ACCESS_DENIED',
                    message: 'Ad account owner has not granted conversion tracking access.',
                    code: error.response?.data?.error?.code
                };
            }
        }

        // Return available data with permission status
        return res.status(200).json({
            pixels: pixels.map(pixel => ({
                id: pixel.id,
                name: pixel.name,
                createdTime: pixel.creation_time,
                lastFiredTime: pixel.last_fired_time,
                isActive: !pixel.is_unavailable
            })),
            customConversions: customConversions.map(conv => ({
                id: conv.id,
                name: conv.name,
                eventType: conv.custom_event_type,
                isArchived: conv.is_archived,
                createdTime: conv.creation_time
            })),
            summary: {
                totalPixels: pixels.length,
                activePixels: pixels.filter(p => !p.is_unavailable).length,
                totalConversions: customConversions.length,
                activeConversions: customConversions.filter(c => !c.is_archived).length,
                hasAccess: !permissionError
            },
            permissionStatus: permissionError ? {
                hasFullAccess: false,
                error: permissionError,
                solution: 'Contact the ad account owner to grant you pixel access, or use a token from the account owner.'
            } : {
                hasFullAccess: true,
                message: 'Full pixel access granted'
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Pixel Tracking Error:', JSON.stringify(error.response?.data || error.message, null, 2));

        // Return graceful error with helpful message
        return res.status(200).json({
            pixels: [],
            customConversions: [],
            summary: {
                totalPixels: 0,
                activePixels: 0,
                totalConversions: 0,
                activeConversions: 0,
                hasAccess: false
            },
            permissionStatus: {
                hasFullAccess: false,
                error: {
                    type: 'PERMISSION_ERROR',
                    message: error.response?.data?.error?.message || error.message,
                    code: error.response?.data?.error?.code
                },
                solution: 'You need to be the ad account owner OR the owner must explicitly grant you pixel access. Use a token from the account owner, or request access in Business Manager.'
            },
            timestamp: new Date().toISOString()
        });
    }
};

// Get detailed pixel statistics
async function getPixelDetails(pixelId, accessToken, since, until, res) {
    const pixelUrl = `https://graph.facebook.com/v21.0/${pixelId}`;

    try {
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
                    'is_unavailable'
                ].join(',')
            }
        });

        const pixel = pixelResponse.data;

        // Get event stats (last 30 days)
        let eventStats = [];
        try {
            const statsResponse = await axios.get(`${pixelUrl}/stats`, {
                params: {
                    access_token: accessToken,
                    start_time: since || getDateDaysAgo(30),
                    end_time: until || getDateDaysAgo(0)
                }
            });

            eventStats = statsResponse.data.data || [];
        } catch (err) {
            console.log('Event stats not available:', err.response?.data?.error?.message);
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
                isActive: !pixel.is_unavailable
            },
            events: eventsByType,
            eventHealth: eventHealth,
            recentServerEvents: [], // Server events require additional permissions
            period: {
                since: since || getDateDaysAgo(30),
                until: until || getDateDaysAgo(0)
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Pixel Details Error:', JSON.stringify(error.response?.data || error.message, null, 2));
        return res.status(500).json({
            error: error.response?.data?.error?.message || error.message,
            details: error.response?.data || null
        });
    }
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
