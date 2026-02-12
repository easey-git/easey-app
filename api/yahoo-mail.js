import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';

export const config = {
    maxDuration: 60,
};

export default async function handler(req, res) {
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

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
            const client = new ImapFlow({
                host: 'imap.mail.yahoo.com',
                port: 993,
                secure: true,
                auth: {
                    user: YAHOO_EMAIL,
                    pass: YAHOO_APP_PASSWORD
                },
                logger: false // Keep logs clean
            });

            await client.connect();

            // Lock Inbox
            let lock = await client.getMailboxLock('INBOX');
            let messages = [];

            try {
                // Fetch latest 20 messages
                // seq: '1:*' means all, but we want latest. 
                // We can use search or fetch with range.
                // Fetching last 20: 
                // First get status to know total count
                // const status = await client.status('INBOX', { messages: true });
                // const total = status.messages;
                // const range = `${Math.max(1, total - 19)}:*`;

                // Simpler: Fetch all UIDs for last 7 days using search, then fetch details
                // Or just fetch the last 20 messages by sequence number which is faster

                // Let's fetch the last 20 messages by sequence
                // We don't know the sequence numbers without selecting box, but getMailboxLock selects it.
                // client.mailbox includes info about currently selected mailbox

                const total = client.mailbox.exists;
                if (total > 0) {
                    const start = Math.max(1, total - 19);
                    const range = `${start}:*`;

                    for await (let message of client.fetch(range, { envelope: true, source: false, uid: true })) {
                        messages.push({
                            id: message.uid,
                            seq: message.seq,
                            from: message.envelope.from && message.envelope.from[0] ? (message.envelope.from[0].name || message.envelope.from[0].address) : 'Unknown',
                            subject: message.envelope.subject || '(No Subject)',
                            date: message.envelope.date ? message.envelope.date.toISOString() : new Date().toISOString(),
                            snippet: 'Loading...' // Body preview requires fetch bodyStructure or source, can be heavy.
                        });
                    }
                }

                // Reverse to show newest first
                messages.reverse();

            } finally {
                lock.release();
            }

            await client.logout();

            return res.json({ success: true, messages });
        }

    } catch (error) {
        console.error("Yahoo Mail Error:", error);
        return res.status(500).json({ error: error.message, stack: error.stack });
    }
}
