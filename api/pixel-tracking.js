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
 * Note: Requires ad account owner permission or explicit access grant
 * Falls back gracefully if permissions are insufficient
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
