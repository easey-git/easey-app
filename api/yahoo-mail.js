const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');

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
        return res.status(500).json({ error: 'Missing Yahoo Credentials in Environment (YAHOO_EMAIL, YAHOO_APP_PASSWORD)' });
    }

    // Determine basic params
    let action = req.query.action || req.body.action;

    // Send params
    let to = req.body.to;
    let subject = req.body.subject;
    let body = req.body.body;

    if (req.method === 'POST' && !action) action = 'send';
    if (req.method === 'GET' && !action) action = 'list';

    try {
        if (action === 'send') {
            // Handle Send
            if (!to || !subject || !body) {
                return res.status(400).json({ error: 'Missing to, subject, or body' });
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

        } else {
            // Handle List using ImapFlow
            // Use a defined timeout to prevent Vercel execution limits from killing it silently
            const client = new ImapFlow({
                host: 'imap.mail.yahoo.com',
                port: 993,
                secure: true,
                auth: {
                    user: YAHOO_EMAIL,
                    pass: YAHOO_APP_PASSWORD
                },
                logger: false, // Disable verbose logging
                emitLogs: false
            });

            // Connect
            await client.connect();

            let messages = [];

            // Perform operations with a lock
            let lock = await client.getMailboxLock('INBOX');
            try {
                // Check if mailbox has messages
                if (client.mailbox.exists > 0) {
                    // Fetch last 20 messages
                    // Use sequence numbers (e.g. "100:*" is last messages if total is > 100)
                    const total = client.mailbox.exists;
                    const start = Math.max(1, total - 19);
                    const range = `${start}:*`;

                    // Fetch envelope and uid
                    for await (let message of client.fetch(range, { envelope: true, uid: true })) {
                        messages.push({
                            id: message.uid.toString(),
                            seq: message.seq,
                            from: message.envelope.from && message.envelope.from[0] ? (message.envelope.from[0].name || message.envelope.from[0].address) : 'Unknown',
                            subject: message.envelope.subject || '(No Subject)',
                            date: message.envelope.date ? message.envelope.date.toISOString() : new Date().toISOString(),
                            snippet: 'Message...'
                        });
                    }
                }
            } finally {
                // Ensure lock is released
                lock.release();
            }

            // Cleanup
            await client.logout();

            // Return in reverse order (newest first)
            return res.json({ success: true, messages: messages.reverse() });
        }

    } catch (error) {
        console.error("Yahoo Mail Error:", error);
        return res.status(500).json({ error: error.message, stack: error.stack });
    }
};
