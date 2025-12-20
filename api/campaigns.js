/**
 * Marketing Campaigns API
 *
 * Fetches active ad campaigns from Meta Marketing API (Facebook/Instagram).
 * Returns key metrics: Spend, ROAS, Purchases, CPM, CPC, CTR.
 *
 * Required Environment Variables:
 * - FACEBOOK_ACCESS_TOKEN: Long-lived Graph API token
 * - AD_ACCOUNT_ID: Ad Account ID with 'act_' prefix
 */

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const ACCESS_TOKEN = process.env.FACEBOOK_ACCESS_TOKEN;
    const AD_ACCOUNT_ID = process.env.AD_ACCOUNT_ID;

    if (!ACCESS_TOKEN || !AD_ACCOUNT_ID) {
        return res.status(500).json({ error: 'Missing Facebook API credentials' });
    }

    try {
        // Fetch Campaigns with Insights for 'today'
        const fields = [
            'name',
            'status',
            'insights.date_preset(today){spend,purchase_roas,actions,cpc,ctr,cpm,impressions,reach,clicks}'
        ].join(',');

        const url = `https://graph.facebook.com/v21.0/${AD_ACCOUNT_ID}/campaigns?fields=${fields}&access_token=${ACCESS_TOKEN}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            console.error('Facebook API Error:', data.error);
            throw new Error(data.error.message);
        }

        // Transform Data for App
        const campaigns = data.data.map(campaign => {
            const insights = campaign.insights ? campaign.insights.data[0] : null;

            // Calculate ROAS safely (checks for 'omni_purchase' or 'purchase')
            let roas = 0;
            if (insights && insights.purchase_roas) {
                const roasData = insights.purchase_roas.find(r => r.action_type === 'omni_purchase' || r.action_type === 'purchase');
                if (roasData) {
                    roas = parseFloat(roasData.value);
                }
            }

            // Calculate Purchases safely
            let purchases = 0;
            if (insights && insights.actions) {
                const purchaseAction = insights.actions.find(a => a.action_type === 'purchase' || a.action_type === 'omni_purchase');
                if (purchaseAction) {
                    purchases = parseInt(purchaseAction.value);
                }
            }

            // Calculate Revenue for Summary (ROAS * Spend)
            const revenue = roas * (insights ? parseFloat(insights.spend || 0) : 0);

            return {
                id: campaign.id,
                name: campaign.name,
                status: campaign.status,
                spend: insights ? parseFloat(insights.spend || 0) : 0,
                revenue: revenue,
                roas: roas.toFixed(2),
                purchases: purchases,
                cpc: insights ? parseFloat(insights.cpc || 0).toFixed(2) : 0,
                ctr: insights ? parseFloat(insights.ctr || 0).toFixed(2) : 0,
                cpm: insights ? parseFloat(insights.cpm || 0).toFixed(2) : 0,
                impressions: insights ? parseInt(insights.impressions || 0) : 0,
                reach: insights ? parseInt(insights.reach || 0) : 0,
                clicks: insights ? parseInt(insights.clicks || 0) : 0,
                platform: 'facebook'
            };
        });

        // Calculate Global Summary
        const summaryTotals = campaigns.reduce((acc, curr) => ({
            spend: acc.spend + curr.spend,
            purchases: acc.purchases + curr.purchases,
            revenue: acc.revenue + curr.revenue,
            impressions: acc.impressions + curr.impressions
        }), { spend: 0, purchases: 0, revenue: 0, impressions: 0 });

        const summary = {
            spend: summaryTotals.spend,
            purchases: summaryTotals.purchases,
            // Weighted Average ROAS = Total Revenue / Total Spend
            roas: summaryTotals.spend > 0 ? (summaryTotals.revenue / summaryTotals.spend).toFixed(2) : 0,
            // Weighted Average CPM = (Total Spend / Total Impressions) * 1000
            cpm: summaryTotals.impressions > 0 ? ((summaryTotals.spend / summaryTotals.impressions) * 1000).toFixed(2) : 0
        };

        return res.status(200).json({
            campaigns,
            summary
        });

    } catch (error) {
        console.error('Facebook API Error:', error);
        return res.status(500).json({ error: error.message });
    }
};
