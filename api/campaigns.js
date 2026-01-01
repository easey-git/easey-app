/**
 * Marketing Campaigns API - Real-time Today's Data
 * 
 * Fetches real-time campaign performance for TODAY only.
 * Optimized for speed and accuracy following Facebook API best practices.
 * 
 * Environment Variables:
 * - FACEBOOK_ACCESS_TOKEN: Long-lived Graph API token
 * - AD_ACCOUNT_ID: Ad Account ID (format: act_xxxxx)
 */

module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Cache-Control, Pragma');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { FACEBOOK_ACCESS_TOKEN, AD_ACCOUNT_ID } = process.env;

    if (!FACEBOOK_ACCESS_TOKEN || !AD_ACCOUNT_ID) {
        return res.status(500).json({
            error: 'Missing Facebook API credentials'
        });
    }

    try {
        // Fetch today's campaign insights in a single API call
        const url = new URL(`https://graph.facebook.com/v21.0/${AD_ACCOUNT_ID}/insights`);
        url.searchParams.set('level', 'campaign');
        url.searchParams.set('date_preset', 'today');
        url.searchParams.set('fields', 'campaign_id,campaign_name,spend,purchase_roas,actions,cpc,ctr,cpm,impressions,reach,clicks');
        url.searchParams.set('access_token', FACEBOOK_ACCESS_TOKEN);

        const response = await fetch(url.toString(), {
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
            }
        });

        const data = await response.json();

        if (data.error) {
            console.error('[Campaigns API] Facebook Error:', data.error);
            return res.status(400).json({
                error: data.error.message || 'Facebook API error'
            });
        }

        // Fetch campaign statuses
        const statusUrl = new URL(`https://graph.facebook.com/v21.0/${AD_ACCOUNT_ID}/campaigns`);
        statusUrl.searchParams.set('fields', 'id,status');
        statusUrl.searchParams.set('access_token', FACEBOOK_ACCESS_TOKEN);

        const statusResponse = await fetch(statusUrl.toString());
        const statusData = await statusResponse.json();

        // Map campaign IDs to statuses
        const statusMap = {};
        if (statusData.data) {
            statusData.data.forEach(campaign => {
                statusMap[campaign.id] = campaign.status;
            });
        }

        // Transform insights into campaign objects
        const campaigns = (data.data || []).map(insight => {
            // Extract ROAS
            let roas = 0;
            if (insight.purchase_roas) {
                const roasMetric = insight.purchase_roas.find(
                    r => r.action_type === 'omni_purchase' || r.action_type === 'purchase'
                );
                if (roasMetric) {
                    roas = parseFloat(roasMetric.value);
                }
            }

            // Extract purchases
            let purchases = 0;
            if (insight.actions) {
                const purchaseMetric = insight.actions.find(
                    a => a.action_type === 'purchase' || a.action_type === 'omni_purchase'
                );
                if (purchaseMetric) {
                    purchases = parseInt(purchaseMetric.value, 10);
                }
            }

            const spend = parseFloat(insight.spend || 0);
            const revenue = roas * spend;

            return {
                id: insight.campaign_id,
                name: insight.campaign_name,
                status: statusMap[insight.campaign_id] || 'UNKNOWN',
                spend: Math.round(spend * 100) / 100,
                revenue: Math.round(revenue * 100) / 100,
                roas: roas.toFixed(2),
                purchases: purchases,
                cpc: parseFloat(insight.cpc || 0).toFixed(2),
                ctr: parseFloat(insight.ctr || 0).toFixed(2),
                cpm: parseFloat(insight.cpm || 0).toFixed(2),
                impressions: parseInt(insight.impressions || 0, 10),
                reach: parseInt(insight.reach || 0, 10),
                clicks: parseInt(insight.clicks || 0, 10),
                platform: 'facebook'
            };
        });

        // Calculate summary metrics
        const totals = campaigns.reduce((acc, campaign) => ({
            spend: acc.spend + campaign.spend,
            revenue: acc.revenue + campaign.revenue,
            purchases: acc.purchases + campaign.purchases,
            impressions: acc.impressions + campaign.impressions
        }), { spend: 0, revenue: 0, purchases: 0, impressions: 0 });

        const summary = {
            spend: Math.round(totals.spend * 100) / 100,
            purchases: totals.purchases,
            roas: totals.spend > 0
                ? ((totals.revenue / totals.spend).toFixed(2))
                : '0.00',
            cpm: totals.impressions > 0
                ? (((totals.spend / totals.impressions) * 1000).toFixed(2))
                : '0.00'
        };

        return res.status(200).json({
            campaigns,
            summary,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('[Campaigns API] Error:', error.message);
        return res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
};
