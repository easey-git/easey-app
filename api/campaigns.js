const axios = require('axios');
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
 * Campaigns API - Fetches today's campaign performance from Meta (Facebook/Instagram)
 * Supports real-time campaign data with metrics like ROAS, spend, purchases, etc.
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
        const accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
        const adAccountId = process.env.AD_ACCOUNT_ID;

        if (!accessToken || !adAccountId) {
            console.error('Meta API Configuration Error: Missing FACEBOOK_ACCESS_TOKEN or AD_ACCOUNT_ID');
            return res.status(500).json({
                error: 'Meta API not configured',
                campaigns: [],
                summary: { spend: 0, roas: 0, purchases: 0, cpm: 0 }
            });
        }

        // Get today's date range
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD

        // Meta Graph API endpoint (Using v21.0 as stable version)
        // Ensure we don't double-prefix 'act_' if the env var already has it
        const cleanAdAccountId = adAccountId.replace(/^act_/, '');
        const url = `https://graph.facebook.com/v21.0/act_${cleanAdAccountId}/campaigns`;

        // Fields to fetch
        // Note: We removed 'purchases' and 'purchase_roas' direct fields as they can cause 500 errors
        // if custom headers or attribution settings are required. We calculate them manually.
        const fields = [
            'id',
            'name',
            'status',
            'effective_status',
            'insights.date_preset(today){' +
            'campaign_name,' +
            'spend,' +
            'impressions,' +
            'reach,' +
            'clicks,' +
            'cpc,' +
            'cpm,' +
            'ctr,' +
            'actions,' +
            'action_values' +
            '}'
        ].join(',');

        // Make API request field
        const response = await axios.get(url, {
            params: {
                access_token: accessToken,
                fields: fields,
                limit: 100, // Fetch up to 100 campaigns
                time_range: JSON.stringify({
                    since: todayStr,
                    until: todayStr
                })
            }
        });

        const campaignsData = response.data.data || [];

        // Process campaigns
        const campaigns = [];
        let totalSpend = 0;
        let totalRevenue = 0;
        let totalPurchases = 0;
        let totalImpressions = 0;

        for (const campaign of campaignsData) {
            const insights = campaign.insights?.data?.[0];

            if (!insights) continue; // Skip campaigns with no data today

            const spend = parseFloat(insights.spend || 0);
            const impressions = parseInt(insights.impressions || 0);
            const reach = parseInt(insights.reach || 0);
            const clicks = parseInt(insights.clicks || 0);
            const cpc = parseFloat(insights.cpc || 0);
            const cpm = parseFloat(insights.cpm || 0);
            const ctr = parseFloat(insights.ctr || 0);

            // Calculate Metrics manually to avoid API errors
            // 1. Purchases Count (from 'actions')
            let purchases = 0;
            if (insights.actions) {
                const purchaseAction = insights.actions.find(
                    a => a.action_type === 'omni_purchase' || a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase'
                );
                purchases = parseInt(purchaseAction?.value || 0);
            }

            // 2. Revenue (from 'action_values')
            let revenue = 0;
            if (insights.action_values) {
                const purchaseValue = insights.action_values.find(
                    av => av.action_type === 'omni_purchase' || av.action_type === 'purchase' || av.action_type === 'offsite_conversion.fb_pixel_purchase'
                );
                revenue = parseFloat(purchaseValue?.value || 0);
            }

            // 3. Calculate ROAS
            const roas = spend > 0 ? (revenue / spend).toFixed(2) : '0.00';

            // Determine platform (facebook or instagram based on campaign name)
            const platform = campaign.name.toLowerCase().includes('instagram') ? 'instagram' : 'facebook';

            // Map effective_status to simplified status
            let status = 'PAUSED';
            if (campaign.effective_status === 'ACTIVE') {
                status = 'ACTIVE';
            } else if (campaign.effective_status === 'IN_PROCESS' || campaign.effective_status === 'WITH_ISSUES') {
                status = 'LEARNING';
            } else if (campaign.effective_status === 'DISAPPROVED') {
                status = 'REJECTED';
            }

            campaigns.push({
                id: campaign.id,
                name: campaign.name,
                status: status,
                platform: platform,
                spend: Math.round(spend),
                revenue: revenue,
                roas: roas,
                purchases: purchases,
                impressions: impressions,
                reach: reach,
                clicks: clicks,
                cpc: cpc.toFixed(2),
                cpm: Math.round(cpm),
                ctr: ctr.toFixed(2)
            });

            // Accumulate totals
            totalSpend += spend;
            totalRevenue += revenue;
            totalPurchases += purchases;
            totalImpressions += impressions;
        }

        // Calculate summary
        const totalRoas = totalSpend > 0 ? (totalRevenue / totalSpend).toFixed(2) : '0.00';
        const totalCpm = totalImpressions > 0 ? Math.round((totalSpend / totalImpressions) * 1000) : 0;

        const summary = {
            spend: Math.round(totalSpend),
            roas: totalRoas,
            purchases: totalPurchases,
            cpm: totalCpm
        };

        return res.status(200).json({
            campaigns: campaigns,
            summary: summary,
            timestamp: new Date().toISOString(),
            date: todayStr
        });

    } catch (error) {
        console.error('Meta Campaigns API Error Details:', JSON.stringify(error.response?.data || error.message, null, 2));

        // Return graceful error response
        return res.status(500).json({
            error: error.response?.data?.error?.message || error.message || 'Failed to fetch campaign data',
            details: error.response?.data || null,
            campaigns: [],
            summary: { spend: 0, roas: 0, purchases: 0, cpm: 0 },
            timestamp: new Date().toISOString()
        });
    }
};
