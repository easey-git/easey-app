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
 * Meta Account API - Comprehensive account, billing, and financial data
 * 
 * Features:
 * - Account balance and spending limits
 * - Payment methods and billing info
 * - Transaction history
 * - Spend tracking (today, this month, lifetime)
 * - Account health status
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
            return res.status(500).json({
                error: 'Meta API not configured',
                account: null
            });
        }

        const cleanAdAccountId = adAccountId.replace(/^act_/, '');
        const baseUrl = `https://graph.facebook.com/v21.0/act_${cleanAdAccountId}`;

        // Fetch comprehensive account data
        const accountFields = [
            'id',
            'account_id',
            'name',
            'currency',
            'timezone_name',
            'account_status',
            'disable_reason',
            'balance',
            'amount_spent',
            'spend_cap',
            'min_daily_budget',
            'business',
            'created_time',
            'owner',
            'funding_source',
            'funding_source_details',
            'adspaymentcycle'
        ].join(',');

        const accountResponse = await axios.get(baseUrl, {
            params: {
                access_token: accessToken,
                fields: accountFields
            }
        });

        const account = accountResponse.data;

        // Get today's date range
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];

        // Fetch today's spend
        const todayInsightsResponse = await axios.get(`${baseUrl}/insights`, {
            params: {
                access_token: accessToken,
                time_range: JSON.stringify({ since: todayStr, until: todayStr }),
                fields: 'spend,account_currency'
            }
        });

        const todaySpend = todayInsightsResponse.data.data?.[0]?.spend || '0';

        // Fetch this month's spend
        const monthInsightsResponse = await axios.get(`${baseUrl}/insights`, {
            params: {
                access_token: accessToken,
                time_range: JSON.stringify({ since: monthStart, until: todayStr }),
                fields: 'spend'
            }
        });

        const monthSpend = monthInsightsResponse.data.data?.[0]?.spend || '0';

        // Fetch recent transactions (last 25)
        let transactions = [];
        try {
            const transactionsResponse = await axios.get(`${baseUrl}/transactions`, {
                params: {
                    access_token: accessToken,
                    limit: 25,
                    fields: 'id,time,amount,status,payment_option_id,charge_type,product_type'
                }
            });
            transactions = transactionsResponse.data.data || [];
        } catch (err) {
            console.log('Transactions not available:', err.message);
        }

        // Parse account status
        const accountStatusMap = {
            1: 'ACTIVE',
            2: 'DISABLED',
            3: 'UNSETTLED',
            7: 'PENDING_RISK_REVIEW',
            8: 'PENDING_SETTLEMENT',
            9: 'IN_GRACE_PERIOD',
            100: 'PENDING_CLOSURE',
            101: 'CLOSED',
            201: 'ANY_ACTIVE',
            202: 'ANY_CLOSED'
        };

        const status = accountStatusMap[account.account_status] || 'UNKNOWN';

        // Calculate balances and limits
        const balance = parseFloat(account.balance || 0) / 100; // Convert from cents to currency
        const amountSpent = parseFloat(account.amount_spent || 0) / 100;
        const spendCap = account.spend_cap ? parseFloat(account.spend_cap) / 100 : null;
        const todaySpendAmount = parseFloat(todaySpend);
        const monthSpendAmount = parseFloat(monthSpend);

        // Calculate remaining amounts
        const remainingBalance = balance > 0 ? balance : null;
        const remainingSpendCap = spendCap ? spendCap - amountSpent : null;

        // Process transactions
        const processedTransactions = transactions.map(txn => ({
            id: txn.id,
            date: new Date(txn.time * 1000).toISOString(),
            amount: parseFloat(txn.amount) / 100,
            status: txn.status,
            type: txn.charge_type,
            product: txn.product_type
        }));

        // Build response
        const response = {
            account: {
                id: account.account_id,
                name: account.name,
                currency: account.currency,
                timezone: account.timezone_name,
                status: status,
                statusCode: account.account_status,
                disableReason: account.disable_reason || null,
                createdTime: account.created_time,
                owner: account.owner || null,
                business: account.business || null
            },
            balance: {
                current: remainingBalance,
                currency: account.currency
            },
            spending: {
                today: todaySpendAmount,
                thisMonth: monthSpendAmount,
                lifetime: amountSpent,
                currency: account.currency
            },
            limits: {
                spendCap: spendCap,
                minDailyBudget: account.min_daily_budget ? parseFloat(account.min_daily_budget) / 100 : null,
                remainingSpendCap: remainingSpendCap,
                currency: account.currency
            },
            paymentCycle: account.adspaymentcycle || null,
            fundingSource: account.funding_source_details ? {
                id: account.funding_source,
                type: account.funding_source_details.type,
                displayString: account.funding_source_details.display_string
            } : null,
            transactions: processedTransactions,
            alerts: generateAlerts(status, remainingBalance, spendCap, amountSpent),
            timestamp: new Date().toISOString()
        };

        return res.status(200).json(response);

    } catch (error) {
        console.error('Meta Account API Error:', JSON.stringify(error.response?.data || error.message, null, 2));

        return res.status(500).json({
            error: error.response?.data?.error?.message || error.message || 'Failed to fetch account data',
            details: error.response?.data || null,
            account: null,
            timestamp: new Date().toISOString()
        });
    }
};

// Generate smart alerts based on account status
function generateAlerts(status, balance, spendCap, amountSpent) {
    const alerts = [];

    // Account status alerts
    if (status === 'DISABLED') {
        alerts.push({
            level: 'critical',
            type: 'ACCOUNT_DISABLED',
            message: 'Your ad account is disabled. Please check Business Manager.'
        });
    } else if (status === 'PENDING_RISK_REVIEW') {
        alerts.push({
            level: 'warning',
            type: 'PENDING_REVIEW',
            message: 'Your account is under review. Ad delivery may be limited.'
        });
    }

    // Balance alerts
    if (balance !== null) {
        if (balance <= 0) {
            alerts.push({
                level: 'critical',
                type: 'NO_BALANCE',
                message: 'Account balance is zero. Please add funds to continue running ads.'
            });
        } else if (balance < 500) {
            alerts.push({
                level: 'warning',
                type: 'LOW_BALANCE',
                message: `Low balance: Only ₹${balance.toFixed(2)} remaining.`
            });
        }
    }

    // Spend cap alerts
    if (spendCap !== null) {
        const percentUsed = (amountSpent / spendCap) * 100;
        if (percentUsed >= 100) {
            alerts.push({
                level: 'critical',
                type: 'SPEND_CAP_REACHED',
                message: 'Account spend cap reached. All campaigns are paused.'
            });
        } else if (percentUsed >= 90) {
            alerts.push({
                level: 'warning',
                type: 'SPEND_CAP_WARNING',
                message: `${percentUsed.toFixed(0)}% of spend cap used. Approaching limit.`
            });
        }
    }

    return alerts;
}
