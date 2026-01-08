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
 * Advanced Analytics API - Deep insights with breakdowns and comparisons
 * 
 * Features:
 * - Custom date ranges
 * - Demographic breakdowns (age, gender, location)
 * - Device and placement breakdowns
 * - Time-based comparisons
 * - Conversion funnel analysis
 * - Attribution windows
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

        const {
            since,
            until,
            breakdown = 'none', // age, gender, country, region, placement, device_platform, publisher_platform
            level = 'campaign', // campaign, adset, ad
            compareWith = 'none' // previous_period, last_week, last_month
        } = req.query;

        // Validate date range
        if (!since || !until) {
            return res.status(400).json({
                error: 'Date range required. Provide "since" and "until" parameters (YYYY-MM-DD)'
            });
        }

        const baseUrl = `https://graph.facebook.com/v21.0/act_${cleanAdAccountId}`;

        // Fetch primary data
        const primaryData = await fetchInsights(
            baseUrl,
            accessToken,
            since,
            until,
            breakdown,
            level
        );

        // Fetch comparison data if requested
        let comparisonData = null;
        if (compareWith !== 'none') {
            const { compareSince, compareUntil } = calculateComparisonDates(since, until, compareWith);
            comparisonData = await fetchInsights(
                baseUrl,
                accessToken,
                compareSince,
                compareUntil,
                breakdown,
                level
            );
        }

        // Process and analyze data
        const analytics = {
            period: {
                since,
                until,
                days: calculateDays(since, until)
            },
            breakdown: breakdown,
            level: level,
            summary: calculateSummary(primaryData),
            breakdownData: breakdown !== 'none' ? groupByBreakdown(primaryData, breakdown) : null,
            comparison: comparisonData ? {
                period: calculateComparisonDates(since, until, compareWith),
                summary: calculateSummary(comparisonData),
                changes: calculateChanges(primaryData, comparisonData)
            } : null,
            topPerformers: getTopPerformers(primaryData, 5),
            trends: calculateTrends(primaryData, since, until),
            timestamp: new Date().toISOString()
        };

        return res.status(200).json(analytics);

    } catch (error) {
        console.error('Advanced Analytics Error:', JSON.stringify(error.response?.data || error.message, null, 2));
        return res.status(500).json({
            error: error.response?.data?.error?.message || error.message,
            details: error.response?.data || null
        });
    }
};

// Fetch insights from Meta API
async function fetchInsights(baseUrl, accessToken, since, until, breakdown, level) {
    // Use the /insights endpoint for accurate reporting
    const endpoint = '/insights';

    const fields = [
        'campaign_id',
        'campaign_name',
        'adset_id',
        'adset_name',
        'ad_id',
        'ad_name',
        'spend',
        'impressions',
        'reach',
        'clicks',
        'cpc',
        'cpm',
        'ctr',
        'frequency',
        'actions',
        'action_values',
        'cost_per_action_type',
        'conversions',
        'cost_per_conversion',
        'video_play_actions',
        'video_p25_watched_actions',
        'video_p50_watched_actions',
        'video_p75_watched_actions',
        'video_p100_watched_actions'
    ].join(',');

    const params = {
        access_token: accessToken,
        fields: fields,
        time_range: JSON.stringify({ since, until }),
        level: level,
        limit: 500
    };

    if (breakdown !== 'none') {
        params.breakdowns = breakdown;
    }

    const response = await axios.get(`${baseUrl}${endpoint}`, { params });
    return response.data.data || [];
}

// Calculate summary metrics
function calculateSummary(data) {
    let totalSpend = 0;
    let totalRevenue = 0;
    let totalPurchases = 0;
    let totalImpressions = 0;
    let totalReach = 0;
    let totalClicks = 0;

    data.forEach(item => {
        // Data is now flat, no need for item.insights.data[0]
        totalSpend += parseFloat(item.spend || 0);
        totalImpressions += parseInt(item.impressions || 0);
        totalReach += parseInt(item.reach || 0);
        totalClicks += parseInt(item.clicks || 0);

        // Extract purchases and revenue
        if (item.actions) {
            const purchaseAction = item.actions.find(
                a => a.action_type === 'omni_purchase' || a.action_type === 'purchase'
            );
            totalPurchases += parseInt(purchaseAction?.value || 0);
        }

        if (item.action_values) {
            const purchaseValue = item.action_values.find(
                av => av.action_type === 'omni_purchase' || av.action_type === 'purchase'
            );
            totalRevenue += parseFloat(purchaseValue?.value || 0);
        }
    });

    const roas = totalSpend > 0 ? (totalRevenue / totalSpend).toFixed(2) : '0.00';
    const cpm = totalImpressions > 0 ? ((totalSpend / totalImpressions) * 1000).toFixed(2) : '0.00';
    const ctr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : '0.00';
    const cpc = totalClicks > 0 ? (totalSpend / totalClicks).toFixed(2) : '0.00';

    return {
        spend: Math.round(totalSpend),
        revenue: Math.round(totalRevenue),
        roas: parseFloat(roas),
        purchases: totalPurchases,
        impressions: totalImpressions,
        reach: totalReach,
        clicks: totalClicks,
        cpm: parseFloat(cpm),
        ctr: parseFloat(ctr),
        cpc: parseFloat(cpc),
        frequency: totalReach > 0 ? (totalImpressions / totalReach).toFixed(2) : '0.00'
    };
}

// Group data by breakdown dimension
function groupByBreakdown(data, breakdown) {
    const grouped = {};

    data.forEach(item => {
        const key = item[breakdown] || 'Unknown';

        if (!grouped[key]) {
            grouped[key] = {
                spend: 0,
                revenue: 0,
                purchases: 0,
                impressions: 0,
                clicks: 0
            };
        }

        grouped[key].spend += parseFloat(item.spend || 0);
        grouped[key].impressions += parseInt(item.impressions || 0);
        grouped[key].clicks += parseInt(item.clicks || 0);

        if (item.actions) {
            const purchaseAction = item.actions.find(
                a => a.action_type === 'omni_purchase' || a.action_type === 'purchase'
            );
            grouped[key].purchases += parseInt(purchaseAction?.value || 0);
        }

        if (item.action_values) {
            const purchaseValue = item.action_values.find(
                av => av.action_type === 'omni_purchase' || av.action_type === 'purchase'
            );
            grouped[key].revenue += parseFloat(purchaseValue?.value || 0);
        }
    });

    // Calculate ROAS for each group
    Object.keys(grouped).forEach(key => {
        const group = grouped[key];
        group.roas = group.spend > 0 ? (group.revenue / group.spend).toFixed(2) : '0.00';
    });

    return grouped;
}

// Calculate comparison changes
function calculateChanges(current, previous) {
    const currentSummary = calculateSummary(current);
    const previousSummary = calculateSummary(previous);

    const calculateChange = (curr, prev) => {
        if (prev === 0) return curr > 0 ? 100 : 0;
        return (((curr - prev) / prev) * 100).toFixed(2);
    };

    return {
        spend: {
            value: currentSummary.spend - previousSummary.spend,
            percentage: calculateChange(currentSummary.spend, previousSummary.spend)
        },
        revenue: {
            value: currentSummary.revenue - previousSummary.revenue,
            percentage: calculateChange(currentSummary.revenue, previousSummary.revenue)
        },
        roas: {
            value: (currentSummary.roas - previousSummary.roas).toFixed(2),
            percentage: calculateChange(currentSummary.roas, previousSummary.roas)
        },
        purchases: {
            value: currentSummary.purchases - previousSummary.purchases,
            percentage: calculateChange(currentSummary.purchases, previousSummary.purchases)
        },
        impressions: {
            value: currentSummary.impressions - previousSummary.impressions,
            percentage: calculateChange(currentSummary.impressions, previousSummary.impressions)
        }
    };
}

// Get top performers
function getTopPerformers(data, limit = 5) {
    const items = data.map(item => {
        const insights = item.insights?.data?.[0];
        if (!insights) return null;

        const spend = parseFloat(insights.spend || 0);
        let revenue = 0;

        if (insights.action_values) {
            const purchaseValue = insights.action_values.find(
                av => av.action_type === 'omni_purchase' || av.action_type === 'purchase'
            );
            revenue = parseFloat(purchaseValue?.value || 0);
        }

        const roas = spend > 0 ? revenue / spend : 0;

        return {
            id: item.id,
            name: item.name,
            spend,
            revenue,
            roas: parseFloat(roas.toFixed(2))
        };
    }).filter(Boolean);

    return items.sort((a, b) => b.roas - a.roas).slice(0, limit);
}

// Calculate trends (daily breakdown)
function calculateTrends(data, since, until) {
    // This would require day-by-day insights
    // For now, return placeholder
    return {
        available: false,
        message: 'Use time_increment parameter for daily trends'
    };
}

// Helper: Calculate comparison dates
function calculateComparisonDates(since, until, compareWith) {
    const sinceDate = new Date(since);
    const untilDate = new Date(until);
    const days = Math.ceil((untilDate - sinceDate) / (1000 * 60 * 60 * 24)) + 1;

    let compareSince, compareUntil;

    if (compareWith === 'previous_period') {
        compareUntil = new Date(sinceDate);
        compareUntil.setDate(compareUntil.getDate() - 1);
        compareSince = new Date(compareUntil);
        compareSince.setDate(compareSince.getDate() - days + 1);
    } else if (compareWith === 'last_week') {
        compareSince = new Date(sinceDate);
        compareSince.setDate(compareSince.getDate() - 7);
        compareUntil = new Date(untilDate);
        compareUntil.setDate(compareUntil.getDate() - 7);
    } else if (compareWith === 'last_month') {
        compareSince = new Date(sinceDate);
        compareSince.setMonth(compareSince.getMonth() - 1);
        compareUntil = new Date(untilDate);
        compareUntil.setMonth(compareUntil.getMonth() - 1);
    }

    return {
        compareSince: compareSince.toISOString().split('T')[0],
        compareUntil: compareUntil.toISOString().split('T')[0]
    };
}

// Helper: Calculate days between dates
function calculateDays(since, until) {
    const sinceDate = new Date(since);
    const untilDate = new Date(until);
    return Math.ceil((untilDate - sinceDate) / (1000 * 60 * 60 * 24)) + 1;
}
