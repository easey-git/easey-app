const nodemailer = require('nodemailer');
const https = require('https');

// Helper to make Yahoo API requests
function yahooAPIRequest(path, accessToken) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.login.yahoo.com',
            path: path,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve(JSON.parse(data));
                } else {
                    reject(new Error(`Yahoo API Error: ${res.statusCode} - ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

module.exports = async (req, res) => {
    // Enable CORS
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    // Handle Preflight
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { YAHOO_EMAIL, YAHOO_APP_PASSWORD } = process.env;

    if (!YAHOO_EMAIL || !YAHOO_APP_PASSWORD) {
        return res.status(500).json({
            error: 'Missing Yahoo Credentials',
            required: ['YAHOO_EMAIL', 'YAHOO_APP_PASSWORD']
        });
    }

    // Determine action
    let action = req.query.action || req.body?.action;

    if (req.method === 'POST' && !action) action = 'send';
    if (req.method === 'GET' && !action) action = 'list';

    try {
        if (action === 'send') {
            // Send email using nodemailer (this works reliably)
            const { to, subject, body } = req.body;

            if (!to || !subject || !body) {
                return res.status(400).json({ error: 'Missing required fields: to, subject, body' });
            }

            const transporter = nodemailer.createTransport({
                service: 'yahoo',
                auth: {
                    user: YAHOO_EMAIL,
                    pass: YAHOO_APP_PASSWORD
                }
            });

            const info = await transporter.sendMail({
                from: YAHOO_EMAIL,
                to,
                subject,
                html: body
            });

            return res.json({ success: true, messageId: info.messageId });

        } else if (action === 'list') {
            // Return mock data for now - IMAP doesn't work in Vercel serverless
            // To properly implement this, you need Yahoo OAuth2 + REST API
            const mockEmails = [
                {
                    id: '1',
                    from: 'example@example.com',
                    subject: 'Welcome to Yahoo Mail Integration',
                    date: new Date().toISOString(),
                    snippet: 'This is a placeholder. To read real emails, implement Yahoo OAuth2 API.'
                },
                {
                    id: '2',
                    from: 'noreply@yahoo.com',
                    subject: 'Setup Instructions',
                    date: new Date(Date.now() - 86400000).toISOString(),
                    snippet: 'IMAP libraries dont work in Vercel serverless. Use Yahoo Mail API with OAuth2 instead.'
                }
            ];

            return res.json({
                success: true,
                messages: mockEmails,
                note: 'These are placeholder emails. Implement Yahoo OAuth2 for real email fetching.'
            });
        } else {
            return res.status(400).json({ error: 'Invalid action. Use "send" or "list"' });
        }

    } catch (error) {
        console.error("Yahoo Mail Error:", error);
        return res.status(500).json({
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};
