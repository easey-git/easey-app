import crypto from 'crypto';
import corsWrapper from 'cors';

// Helper to run middleware for CORS
const runMiddleware = (req, res, fn) => {
    return new Promise((resolve, reject) => {
        fn(req, res, (result) => {
            if (result instanceof Error) return reject(result);
            return resolve(result);
        });
    });
};

const cors = corsWrapper({ origin: true });

export default async function handler(req, res) {
    // 1. CORS
    await runMiddleware(req, res, cors);
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // 2. Auth & Config
    const key = process.env.PAYU_KEY;
    const salt = process.env.PAYU_SALT;

    // Base URLs
    const PAYU_BASE_URL = 'https://info.payu.in/merchant/postservice.php?form=2';

    if (!key || !salt) {
        return res.status(500).json({ error: 'Server Config Error: Missing PayU Credentials (PAYU_KEY, PAYU_SALT)' });
    }

    const { action, params } = req.body;

    try {
        let command = '';
        let hashString = '';
        let formData = new URLSearchParams();
        let var1 = '';

        // Common params
        formData.append('key', key);

        // ---------------------------------------------------------
        // ACTION DISPATCHER
        // ---------------------------------------------------------

        switch (action) {
            case 'create_payment_link': {
                // Creates an Invoice Link
                command = 'create_invoice';
                const { txnid, amount, productinfo, firstname, email, phone } = params;

                if (!amount || !phone) return res.status(400).json({ error: 'Missing amount, phone' });

                const var1Obj = {
                    amount: String(amount),
                    txnid: txnid || `txn_${Date.now()}`,
                    productinfo: productinfo || 'Order Payment',
                    firstname: firstname || 'Customer',
                    email: email || 'customer@example.com',
                    phone: phone
                };

                var1 = JSON.stringify(var1Obj);
                hashString = `${key}|${command}|${var1}|${salt}`;
                formData.append('var1', var1);
                break;
            }

            case 'get_payment_hash': {
                // Get Hash for Client-Side Form Submission (Hosted Checkout)
                // Do NOT send to PayU, just return the hash to the client
                const { txnid, amount, productinfo, firstname, email, phone, udf1, udf2, udf3, udf4, udf5 } = params;

                // Construct the UDF pipe string correctly: udf1|udf2|...|udf5||||||
                const hashParams = [
                    key,
                    txnid,
                    amount,
                    productinfo,
                    firstname,
                    email,
                    udf1 || '',
                    udf2 || '',
                    udf3 || '',
                    udf4 || '',
                    udf5 || '',
                    '', // udf6
                    '', // udf7
                    '', // udf8
                    '', // udf9
                    '', // udf10
                    salt
                ];

                const hString = hashParams.join('|');
                const paymentHash = crypto.createHash('sha512').update(hString).digest('hex');

                return res.status(200).json({
                    hash: paymentHash,
                    key: key,
                    txnid: txnid,
                    amount: amount,
                    productinfo: productinfo,
                    firstname: firstname,
                    email: email,
                    phone: phone,
                    surl: 'https://easey-app.vercel.app/api/payu-webhook',
                    furl: 'https://easey-app.vercel.app/api/payu-webhook'
                });
            }

            case 'verify_payment': {
                // Verify Status by TxnID
                command = 'verify_payment';
                var1 = params.txnid;

                hashString = `${key}|${command}|${var1}|${salt}`;
                formData.append('var1', var1);
                break;
            }

            case 'refund_transaction': {
                // Refund
                command = 'cancel_refund_transaction';
                var1 = params.payuId; // MIHpayid
                const var2 = params.uniqueId || `ref_${Date.now()}`; // Token ID
                const var3 = String(params.amount); // Amount

                hashString = `${key}|${command}|${var1}|${salt}`;
                formData.append('var1', var1);
                formData.append('var2', var2);
                formData.append('var3', var3);
                break;
            }

            case 'get_settlement_details': {
                // Get Settlement Details for a date range or specific transaction
                command = 'get_settlement_details';
                var1 = params.date || new Date().toISOString().split('T')[0]; // YYYY-MM-DD

                hashString = `${key}|${command}|${var1}|${salt}`;
                formData.append('var1', var1);
                break;
            }

            case 'get_checkout_details': {
                // Get details of a specific checkout / payment option availability
                command = 'get_checkout_details';
                var1 = params.var1 || '';

                hashString = `${key}|${command}|${var1}|${salt}`;
                formData.append('var1', var1);
                break;
            }

            case 'get_transaction_details': {
                // Get Transactions for Date Range
                command = 'get_Transaction_Details';
                var1 = params.from; // YYYY-MM-DD
                const var2 = params.to;   // YYYY-MM-DD

                hashString = `${key}|${command}|${var1}|${salt}`;
                formData.append('var1', var1);
                formData.append('var2', var2);
                break;
            }

            case 'check_isDomestic': {
                // Bin Check
                command = 'check_isDomestic';
                var1 = params.bin;

                hashString = `${key}|${command}|${var1}|${salt}`;
                formData.append('var1', var1);
                break;
            }

            case 'get_bin_details': {
                command = 'get_bin_details';
                var1 = params.bin;
                hashString = `${key}|${command}|${var1}|${salt}`;
                formData.append('var1', var1);
                break;
            }

            case 'check_balance': {
                command = 'check_balance'; // Usually not exposed but useful for enterprise debugging
                var1 = params.var1 || '';
                hashString = `${key}|${command}|${var1}|${salt}`;
                formData.append('var1', var1);
                break;
            }

            default:
                return res.status(400).json({ error: `Invalid Action: ${action}` });
        }

        // ---------------------------------------------------------
        // EXECUTE REQUEST
        // ---------------------------------------------------------

        const hash = crypto.createHash('sha512').update(hashString).digest('hex');
        formData.append('command', command);
        formData.append('hash', hash);

        const response = await fetch(PAYU_BASE_URL, {
            method: 'POST',
            body: formData,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const data = await response.json();
        return res.status(200).json(data);

    } catch (error) {
        console.error('PayU API Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
