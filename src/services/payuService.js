
const BASE_URL = 'https://easey-app.vercel.app/api/payu';

/**
 * Generates a PayU Payment Link (Invoice) for an order.
 * @param {Object} order - Order object containing details
 * @returns {Promise<Object>} - Result with invoice URL or status
 */
export const generatePaymentLink = async (order) => {
    try {
        const payload = {
            action: 'create_payment_link',
            params: {
                txnid: order.orderId ? `txn_${order.orderId}` : `txn_${Date.now()}`, // Ensure unique txn ID
                amount: order.totalPrice || order.total_price,
                productinfo: `Order #${order.orderNumber || order.order_number}`,
                firstname: order.customerName ? order.customerName.split(' ')[0] : 'Customer',
                email: order.email || 'guest@example.com',
                phone: order.phoneNormalized || order.phone
            }
        };

        const response = await fetch(BASE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        return await response.json();
    } catch (error) {
        console.error('PayU Link Generation Error:', error);
        throw error;
    }
};

/**
 * Gets the hash and parameters for a Hosted Checkout (Direct POST)
 * @param {Object} details - { txnid, amount, productinfo, firstname, email, phone }
 */
export const getPaymentHash = async (details) => {
    try {
        const payload = {
            action: 'get_payment_hash',
            params: details
        };

        const response = await fetch(BASE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        return await response.json();
    } catch (error) {
        console.error('PayU Hash Error:', error);
        throw error;
    }
};

/**
 * Verifies a payment status using the transaction ID.
 * @param {string} txnid - The transaction ID sent to PayU
 * @returns {Promise<Object>} - Transaction details
 */
export const verifyPayment = async (txnid) => {
    try {
        const response = await fetch(BASE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'verify_payment',
                params: { txnid }
            })
        });

        return await response.json();
    } catch (error) {
        console.error('PayU Verification Error:', error);
        throw error;
    }
};

/**
 * Initiates a refund for a transaction.
 * @param {string} payuId - The MIH PayU ID (from verification)
 * @param {number} amount - Amount to refund
 * @returns {Promise<Object>} - Refund status
 */
export const refundTransaction = async (payuId, amount) => {
    try {
        const response = await fetch(BASE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'refund_transaction',
                params: {
                    payuId,
                    amount
                }
            })
        });

        return await response.json();
    } catch (error) {
        console.error('PayU Refund Error:', error);
        throw error;
    }
};

/**
 * Gets Settlement Details for a specific date or transaction
 * @param {string} date - YYYY-MM-DD
 */
export const getSettlementDetails = async (date) => {
    try {
        const response = await fetch(BASE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'get_settlement_details',
                params: { date }
            })
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
};

/**
 * Gets Transaction Details for a date range
 * @param {string} from - YYYY-MM-DD
 * @param {string} to - YYYY-MM-DD
 */
export const getTransactionDetails = async (from, to) => {
    try {
        const response = await fetch(BASE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'get_transaction_details',
                params: { from, to }
            })
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
};

/**
 * Checks if a BIN (Card) is domestic or international
 * @param {string} bin - First 6 digits of card
 */
export const checkBinDetails = async (bin) => {
    try {
        const response = await fetch(BASE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'get_bin_details',
                params: { bin }
            })
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
};
