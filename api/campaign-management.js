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
 * Campaign Management API - Unified endpoint for all campaign operations
 * 
 * Methods:
 * - GET: List/view campaigns with advanced filtering and analytics
 * - POST: Create new campaign
 * - PATCH: Update campaign (pause/resume, budget, name, etc.)
 * - DELETE: Delete campaign
 * 
 * Features:
 * - Flexible date ranges (today, custom, presets)
 * - Status filtering and sorting
 * - Demographic/device/placement breakdowns
 * - Full CRUD operations
 * - Industry-standard error handling
 */

module.exports = async (req, res) => {
    await runMiddleware(req, res, cors);

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
    const adAccountId = process.env.AD_ACCOUNT_ID;

    if (!accessToken || !adAccountId) {
        console.error('Meta API Configuration Error: Missing FACEBOOK_ACCESS_TOKEN or AD_ACCOUNT_ID');
        return res.status(500).json({
            error: 'Meta API not configured',
            message: 'Please configure FACEBOOK_ACCESS_TOKEN and AD_ACCOUNT_ID in environment variables'
        });
    }

    const cleanAdAccountId = adAccountId.replace(/^act_/, '');

    try {
        switch (req.method) {
            case 'GET':
                return await handleGet(req, res, accessToken, cleanAdAccountId);
            // case 'POST':
            //     return await handleCreate(req, res, accessToken, cleanAdAccountId);
            case 'PATCH':
                return await handleUpdate(req, res, accessToken);
            case 'DELETE':
                return await handleDelete(req, res, accessToken);
            default:
                return res.status(405).json({ error: 'Method not allowed' });
        }
    } catch (error) {
        console.error('Campaign Management Error:', JSON.stringify(error.response?.data || error.message, null, 2));
        return res.status(500).json({
            error: error.response?.data?.error?.message || error.message || 'Operation failed',
            details: error.response?.data || null,
            timestamp: new Date().toISOString()
        });
    }
};

// ============================================================================
// GET: List/View Campaigns
// ============================================================================
async function handleGet(req, res, accessToken, adAccountId) {
    const {
        since,
        until,
        datePreset = 'today',
        status,
        breakdown,
        limit = 100,
        sortBy = 'roas',
        sortOrder = 'desc',
        scope,         // 'campaigns' (default) or 'adsets'
        campaignId     // Required if scope is 'adsets'
    } = req.query;

    // Handle Ad Sets Fetch scope
    if (scope === 'adsets') {
        if (!campaignId) {
            return res.status(400).json({ error: 'campaignId is required when scope is adsets' });
        }
        return await handleGetAdSets(req, res, accessToken, campaignId);
    }

    // Determine date range
    const today = new Date().toISOString().split('T')[0];
    const sinceDate = since || today;
    const untilDate = until || today;

    const url = `https://graph.facebook.com/v21.0/act_${adAccountId}/campaigns`;

    // Build insights fields
    const insightsFields = [
        'campaign_name',
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
        'video_play_actions',
        'video_p25_watched_actions',
        'video_p50_watched_actions',
        'video_p75_watched_actions',
        'video_p100_watched_actions'
    ];

    const fields = [
        'id',
        'name',
        'status',
        'effective_status',
        'objective',
        'daily_budget',
        'lifetime_budget',
        'budget_remaining',
        'created_time',
        'start_time',
        'stop_time',
        'updated_time',
        `insights${since && until ? '' : `.date_preset(${datePreset})`}{${insightsFields.join(',')}}`
    ].join(',');

    const params = {
        access_token: accessToken,
        fields: fields,
        limit: parseInt(limit)
    };

    // Add time range if custom dates provided
    if (since && until) {
        params.time_range = JSON.stringify({
            since: sinceDate,
            until: untilDate
        });
    }

    // Add status filter
    if (status && status !== 'ALL') {
        const statusMap = {
            'ACTIVE': ['ACTIVE'],
            'PAUSED': ['PAUSED'],
            'LEARNING': ['IN_PROCESS', 'WITH_ISSUES'],
            'REJECTED': ['DISAPPROVED']
        };
        params.effective_status = JSON.stringify(statusMap[status] || [status]);
    }

    // Add breakdown if requested
    if (breakdown && breakdown !== 'none') {
        params.breakdowns = breakdown;
    }

    const response = await axios.get(url, { params });
    const campaignsData = response.data.data || [];

    // Process campaigns
    const campaigns = [];
    let totalSpend = 0;
    let totalRevenue = 0;
    let totalPurchases = 0;
    let totalImpressions = 0;
    let totalReach = 0;
    let totalClicks = 0;

    for (const campaign of campaignsData) {
        const insights = campaign.insights?.data?.[0];

        // Skip campaigns with no insights data
        if (!insights) {
            // Still include campaign info but with zero metrics
            campaigns.push({
                id: campaign.id,
                name: campaign.name,
                status: mapStatus(campaign.effective_status),
                effectiveStatus: campaign.effective_status,
                objective: campaign.objective || 'UNKNOWN',
                platform: detectPlatform(campaign.name),
                budget: {
                    daily: campaign.daily_budget ? parseFloat(campaign.daily_budget) / 100 : null,
                    lifetime: campaign.lifetime_budget ? parseFloat(campaign.lifetime_budget) / 100 : null,
                    remaining: campaign.budget_remaining ? parseFloat(campaign.budget_remaining) / 100 : null
                },
                dates: {
                    created: campaign.created_time,
                    start: campaign.start_time,
                    stop: campaign.stop_time,
                    updated: campaign.updated_time
                },
                performance: null
            });
            continue;
        }

        const spend = parseFloat(insights.spend || 0);
        const impressions = parseInt(insights.impressions || 0);
        const reach = parseInt(insights.reach || 0);
        const clicks = parseInt(insights.clicks || 0);
        const cpc = parseFloat(insights.cpc || 0);
        const cpm = parseFloat(insights.cpm || 0);
        const ctr = parseFloat(insights.ctr || 0);
        const frequency = parseFloat(insights.frequency || 0);

        // Extract purchases and revenue
        let purchases = 0;
        let revenue = 0;

        if (insights.actions) {
            const purchaseAction = insights.actions.find(
                a => a.action_type === 'omni_purchase' ||
                    a.action_type === 'purchase' ||
                    a.action_type === 'offsite_conversion.fb_pixel_purchase'
            );
            purchases = parseInt(purchaseAction?.value || 0);
        }

        if (insights.action_values) {
            const purchaseValue = insights.action_values.find(
                av => av.action_type === 'omni_purchase' ||
                    av.action_type === 'purchase' ||
                    av.action_type === 'offsite_conversion.fb_pixel_purchase'
            );
            revenue = parseFloat(purchaseValue?.value || 0);
        }

        const roas = spend > 0 ? parseFloat((revenue / spend).toFixed(2)) : 0;

        campaigns.push({
            id: campaign.id,
            name: campaign.name,
            status: mapStatus(campaign.effective_status),
            effectiveStatus: campaign.effective_status,
            objective: campaign.objective || 'UNKNOWN',
            platform: detectPlatform(campaign.name),
            budget: {
                daily: campaign.daily_budget ? parseFloat(campaign.daily_budget) / 100 : null,
                lifetime: campaign.lifetime_budget ? parseFloat(campaign.lifetime_budget) / 100 : null,
                remaining: campaign.budget_remaining ? parseFloat(campaign.budget_remaining) / 100 : null
            },
            dates: {
                created: campaign.created_time,
                start: campaign.start_time,
                stop: campaign.stop_time,
                updated: campaign.updated_time
            },
            performance: {
                spend: Math.round(spend),
                revenue: Math.round(revenue),
                roas: roas,
                purchases: purchases,
                impressions: impressions,
                reach: reach,
                clicks: clicks,
                cpc: parseFloat(cpc.toFixed(2)),
                cpm: Math.round(cpm),
                ctr: parseFloat(ctr.toFixed(2)),
                frequency: parseFloat(frequency.toFixed(2))
            }
        });

        // Accumulate totals
        totalSpend += spend;
        totalRevenue += revenue;
        totalPurchases += purchases;
        totalImpressions += impressions;
        totalReach += reach;
        totalClicks += clicks;
    }

    // Sort campaigns
    campaigns.sort((a, b) => {
        if (!a.performance || !b.performance) return 0;

        let aVal, bVal;
        switch (sortBy) {
            case 'roas':
                aVal = a.performance.roas;
                bVal = b.performance.roas;
                break;
            case 'spend':
                aVal = a.performance.spend;
                bVal = b.performance.spend;
                break;
            case 'purchases':
                aVal = a.performance.purchases;
                bVal = b.performance.purchases;
                break;
            case 'revenue':
                aVal = a.performance.revenue;
                bVal = b.performance.revenue;
                break;
            default:
                return 0;
        }

        return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
    });

    // Calculate summary
    const totalRoas = totalSpend > 0 ? parseFloat((totalRevenue / totalSpend).toFixed(2)) : 0;
    const totalCpm = totalImpressions > 0 ? Math.round((totalSpend / totalImpressions) * 1000) : 0;
    const totalCtr = totalImpressions > 0 ? parseFloat(((totalClicks / totalImpressions) * 100).toFixed(2)) : 0;
    const totalCpc = totalClicks > 0 ? parseFloat((totalSpend / totalClicks).toFixed(2)) : 0;
    const totalFrequency = totalReach > 0 ? parseFloat((totalImpressions / totalReach).toFixed(2)) : 0;

    const summary = {
        spend: Math.round(totalSpend),
        revenue: Math.round(totalRevenue),
        roas: totalRoas,
        purchases: totalPurchases,
        impressions: totalImpressions,
        reach: totalReach,
        clicks: totalClicks,
        cpm: totalCpm,
        ctr: totalCtr,
        cpc: totalCpc,
        frequency: totalFrequency
    };

    return res.status(200).json({
        campaigns: campaigns,
        summary: summary,
        meta: {
            count: campaigns.length,
            dateRange: {
                since: sinceDate,
                until: untilDate,
                preset: !since && !until ? datePreset : null
            },
            filters: {
                status: status || 'ALL',
                breakdown: breakdown || 'none'
            },
            sorting: {
                by: sortBy,
                order: sortOrder
            }
        },
        timestamp: new Date().toISOString()
    });
}

// ============================================================================
// GET: List Ad Sets (Helper)
// ============================================================================
async function handleGetAdSets(req, res, accessToken, campaignId) {
    const url = `https://graph.facebook.com/v21.0/${campaignId}/adsets`;

    const fields = [
        'id',
        'name',
        'status',
        'effective_status',
        'daily_budget',
        'lifetime_budget',
        'budget_remaining',
        'start_time',
        'end_time'
    ].join(',');

    try {
        const response = await axios.get(url, {
            params: {
                access_token: accessToken,
                fields: fields,
                limit: 50
            }
        });

        const adSets = response.data.data.map(adSet => ({
            id: adSet.id,
            name: adSet.name,
            status: mapStatus(adSet.effective_status),
            effectiveStatus: adSet.effective_status,
            budget: {
                daily: adSet.daily_budget ? parseFloat(adSet.daily_budget) / 100 : null,
                lifetime: adSet.lifetime_budget ? parseFloat(adSet.lifetime_budget) / 100 : null,
                remaining: adSet.budget_remaining ? parseFloat(adSet.budget_remaining) / 100 : null
            },
            dates: {
                start: adSet.start_time,
                end: adSet.end_time
            }
        }));

        return res.status(200).json({
            success: true,
            adSets: adSets,
            count: adSets.length,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Ad Sets Fetch Error:', error.message);
        throw error; // Let main catch block handle it
    }
}



// ============================================================================
// PATCH: Update Campaign
// ============================================================================
async function handleUpdate(req, res, accessToken) {
    const {
        campaignId,
        adSetId,
        name,
        status,
        dailyBudget,
        lifetimeBudget
    } = req.body;

    // Determine target ID (Campaign or Ad Set)
    const targetId = adSetId || campaignId;

    if (!targetId) {
        return res.status(400).json({
            error: 'Validation failed',
            message: 'campaignId or adSetId is required'
        });
    }

    const url = `https://graph.facebook.com/v21.0/${targetId}`;

    const data = {
        access_token: accessToken
    };

    if (name !== undefined) {
        if (name.trim().length === 0) {
            return res.status(400).json({
                error: 'Validation failed',
                message: 'Campaign name cannot be empty'
            });
        }
        data.name = name.trim();
    }

    if (status !== undefined) {
        if (!['ACTIVE', 'PAUSED'].includes(status)) {
            return res.status(400).json({
                error: 'Validation failed',
                message: 'Status must be either ACTIVE or PAUSED'
            });
        }
        data.status = status;
    }

    if (dailyBudget !== undefined) {
        if (dailyBudget < 1) {
            return res.status(400).json({
                error: 'Validation failed',
                message: 'Daily budget must be at least ₹1'
            });
        }
        data.daily_budget = Math.round(dailyBudget * 100);
    }

    if (lifetimeBudget !== undefined) {
        data.lifetime_budget = Math.round(lifetimeBudget * 100);
    }

    const response = await axios.post(url, null, { params: data });

    return res.status(200).json({
        success: response.data.success,
        message: 'Update successful',
        targetId: targetId,
        updates: {
            name: name,
            status: status,
            dailyBudget: dailyBudget,
            lifetimeBudget: lifetimeBudget
        },
        timestamp: new Date().toISOString()
    });
}

// ============================================================================
// DELETE: Delete Campaign
// ============================================================================
async function handleDelete(req, res, accessToken) {
    const { campaignId } = req.query;

    if (!campaignId) {
        return res.status(400).json({
            error: 'Validation failed',
            message: 'campaignId query parameter is required'
        });
    }

    const url = `https://graph.facebook.com/v21.0/${campaignId}`;

    const response = await axios.delete(url, {
        params: { access_token: accessToken }
    });

    return res.status(200).json({
        success: response.data.success,
        message: 'Campaign deleted successfully',
        campaignId: campaignId,
        timestamp: new Date().toISOString()
    });
}

// ============================================================================
// Helper Functions
// ============================================================================

function mapStatus(effectiveStatus) {
    if (effectiveStatus === 'ACTIVE') return 'ACTIVE';
    if (effectiveStatus === 'IN_PROCESS' || effectiveStatus === 'WITH_ISSUES') return 'LEARNING';
    if (effectiveStatus === 'DISAPPROVED') return 'REJECTED';
    return 'PAUSED';
}

function detectPlatform(campaignName) {
    const name = campaignName.toLowerCase();
    if (name.includes('instagram') || name.includes('ig')) return 'instagram';
    if (name.includes('facebook') || name.includes('fb')) return 'facebook';
    return 'facebook'; // Default to Facebook
}
