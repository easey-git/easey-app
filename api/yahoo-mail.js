import imaps from 'imap-simple';
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
    let limit = req.query.limit || req.body.limit || 20;
    let folder = req.query.folder || req.body.folder || 'INBOX';

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
            // Handle List
            const config = {
                imap: {
                    user: YAHOO_EMAIL,
                    password: YAHOO_APP_PASSWORD,
                    host: 'imap.mail.yahoo.com',
                    port: 993,
                    tls: true,
                    authTimeout: 10000,
                    tlsOptions: { rejectUnauthorized: false }
                }
            };

            const connection = await imaps.connect(config);
            await connection.openBox(folder);

            // Fetch last 7 days
            const delay = 7 * 24 * 3600 * 1000;
            const sinceDate = new Date();
            sinceDate.setTime(Date.now() - delay);
            const searchCriteria = [['SINCE', sinceDate]];

            const fetchOptions = {
                bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE)'],
                struct: true
            };

            // Fetch
            const messages = await connection.search(searchCriteria, fetchOptions);

            // Map and Sort (Newest first)
            const mapped = messages.map((msg) => {
                const headerPart = msg.parts.find(p => p.which.includes('HEADER'));
                const headers = headerPart && headerPart.body ? headerPart.body : {};

                return {
                    id: msg.attributes.uid,
                    seq: msg.seqno,
                    from: headers.from ? headers.from[0] : 'Unknown',
                    subject: headers.subject ? headers.subject[0] : '(No Subject)',
                    date: headers.date ? headers.date[0] : '',
                };
            });

            // Sort by seq (descending - new to old)
            mapped.sort((a, b) => b.seq - a.seq);

            // Limit
            const result = mapped.slice(0, parseInt(limit));

            connection.end();
            return res.json({ success: true, messages: result });
        }

    } catch (error) {
        console.error("Yahoo Mail Error:", error);
        return res.status(500).json({ error: error.message });
    }
}
