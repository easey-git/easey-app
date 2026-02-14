const { google } = require('googleapis');
const admin = require("firebase-admin");
const cors = require('cors')({ origin: true });

if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
        });
    } catch (error) {
        console.error('Firebase Admin Init Error:', error);
    }
}
const db = admin.firestore();

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const getTokens = async (userId) => {
    const doc = await db.collection('users').doc(userId).collection('integrations').doc('gmail').get();
    if (!doc.exists) return null;
    return doc.data();
};

const storeTokens = async (userId, tokens) => {
    await db.collection('users').doc(userId).collection('integrations').doc('gmail').set(tokens, { merge: true });
};

const runMiddleware = (req, res, fn) => {
    return new Promise((resolve, reject) => {
        fn(req, res, (result) => {
            if (result instanceof Error) return reject(result);
            return resolve(result);
        });
    });
};

module.exports.config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb',
        },
    },
};

module.exports = async (req, res) => {
    await runMiddleware(req, res, cors);

    const { method } = req;
    const { action } = req.query;

    const oauth2Client = new google.auth.OAuth2(
        CLIENT_ID,
        CLIENT_SECRET,
        "https://easey-app.vercel.app/api/gmail"
    );

    try {
        if (method === 'POST' && action === 'auth') {
            const { code, redirectUri, userId, codeVerifier } = req.body;

            if (!code || !redirectUri || !userId) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            const authClient = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, redirectUri);
            const { tokens } = await authClient.getToken({ code, codeVerifier });

            await storeTokens(userId, tokens);
            return res.status(200).json({ success: true });
        }

        if (method === 'POST' && action === 'logout') {
            const { userId } = req.body;
            if (!userId) return res.status(400).json({ error: 'User ID required' });

            const tokens = await getTokens(userId);
            if (tokens) {
                try {
                    const tokenToRevoke = tokens.access_token || tokens.refresh_token;
                    if (tokenToRevoke) {
                        try {
                            await oauth2Client.revokeToken(tokenToRevoke);
                        } catch (revokeErr) {
                            console.warn('Revoke failed:', revokeErr.message);
                        }
                    }
                } catch (e) { }

                await db.collection('users').doc(userId).collection('integrations').doc('gmail').delete();
            }
            return res.status(200).json({ success: true });
        }

        if (method === 'GET' && action === 'status') {
            const { userId } = req.query;
            const tokens = await getTokens(userId);
            return res.status(200).json({ connected: !!tokens && !!tokens.refresh_token });
        }

        const userId = req.query.userId || req.body.userId;
        if (!userId) return res.status(400).json({ error: 'User ID required' });

        const storedTokens = await getTokens(userId);
        if (!storedTokens) return res.status(401).json({ error: 'Gmail not connected' });

        oauth2Client.setCredentials(storedTokens);

        const ensureTokensSaved = async () => {
            const currentTokens = oauth2Client.credentials;
            if (currentTokens && currentTokens.access_token !== storedTokens.access_token) {
                await storeTokens(userId, { ...storedTokens, ...currentTokens });
            }
        };

        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        if (method === 'GET' && action === 'list') {
            const { label = 'INBOX' } = req.query;
            let listParams = {
                userId: 'me',
                maxResults: 20,
                pageToken: req.query.pageToken || undefined,
                q: req.query.q || ''
            };

            if (label !== 'ALL') {
                listParams.labelIds = [label];
            } else {
                listParams.includeSpamTrash = true;
                listParams.q = (listParams.q ? listParams.q + ' ' : '') + '-label:TRASH';
            }

            if (label === 'TRASH' || label === 'SPAM') {
                listParams.includeSpamTrash = true;
            }

            const response = await gmail.users.threads.list(listParams);
            await ensureTokensSaved();

            const threads = response.data.threads || [];
            const results = await Promise.allSettled(threads.map(async (thread) => {
                try {
                    const threadDetails = await gmail.users.threads.get({
                        userId: 'me',
                        id: thread.id,
                        format: 'metadata',
                        metadataHeaders: ['Subject', 'From', 'Date']
                    });

                    const messages = threadDetails.data.messages || [];
                    const lastMessage = messages[messages.length - 1];
                    const headers = lastMessage.payload.headers;
                    const subject = headers.find(h => h.name === 'Subject')?.value || '(No Subject)';
                    const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
                    const date = headers.find(h => h.name === 'Date')?.value;

                    return {
                        id: thread.id,
                        snippet: threadDetails.data.snippet,
                        subject,
                        from,
                        date,
                        msgCount: messages.length
                    };
                } catch (e) {
                    return null;
                }
            }));

            const detailedThreads = results
                .filter(r => r.status === 'fulfilled' && r.value !== null)
                .map(r => r.value);

            return res.status(200).json({
                threads: detailedThreads,
                nextPageToken: response.data.nextPageToken
            });
        }

        if (method === 'GET' && action === 'get') {
            const { id } = req.query;
            const response = await gmail.users.threads.get({
                userId: 'me',
                id: id,
                format: 'full'
            });
            await ensureTokensSaved();
            return res.status(200).json(response.data);
        }

        if (method === 'GET' && action === 'attachment') {
            const { messageId, attachmentId } = req.query;
            if (!messageId || !attachmentId) return res.status(400).json({ error: 'Missing attachment params' });

            const response = await gmail.users.messages.attachments.get({
                userId: 'me',
                messageId,
                id: attachmentId
            });
            await ensureTokensSaved();
            return res.status(200).json(response.data);
        }

        if (method === 'POST' && action === 'modify') {
            const { threadId, threadIds, addLabelIds = [], removeLabelIds = [] } = req.body;
            const idsToProcess = threadIds || (threadId ? [threadId] : []);

            if (idsToProcess.length === 0) return res.status(400).json({ error: 'Thread IDs required' });

            await Promise.all(idsToProcess.map(id =>
                gmail.users.threads.modify({
                    userId: 'me',
                    id: id,
                    requestBody: { addLabelIds, removeLabelIds }
                })
            ));

            await ensureTokensSaved();
            return res.status(200).json({ success: true, count: idsToProcess.length });
        }

        if (method === 'POST' && action === 'delete') {
            const { threadId, threadIds } = req.body;
            const idsToProcess = threadIds || (threadId ? [threadId] : []);

            if (idsToProcess.length === 0) return res.status(400).json({ error: 'Thread IDs required' });

            await Promise.all(idsToProcess.map(id =>
                gmail.users.threads.delete({ userId: 'me', id: id })
            ));

            await ensureTokensSaved();
            return res.status(200).json({ success: true, count: idsToProcess.length });
        }

        if (method === 'POST' && action === 'send') {
            const { to, subject, body, threadId, attachments = [] } = req.body;
            const boundary = "__easey_boundary__";
            const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;

            let messageParts = [];
            messageParts.push(`To: ${to}`);
            messageParts.push(`Subject: ${utf8Subject}`);
            messageParts.push('MIME-Version: 1.0');
            messageParts.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
            messageParts.push('');
            messageParts.push(`--${boundary}`);
            messageParts.push('Content-Type: text/html; charset=utf-8');
            messageParts.push('');
            messageParts.push(body);
            messageParts.push('');

            if (attachments && attachments.length > 0) {
                for (const file of attachments) {
                    messageParts.push(`--${boundary}`);
                    messageParts.push(`Content-Type: ${file.mimeType}; name="${file.name}"`);
                    messageParts.push(`Content-Disposition: attachment; filename="${file.name}"`);
                    messageParts.push(`Content-Transfer-Encoding: base64`);
                    messageParts.push('');
                    messageParts.push(file.data);
                    messageParts.push('');
                }
            }

            messageParts.push(`--${boundary}--`);

            const message = messageParts.join('\n');
            const encodedMessage = Buffer.from(message)
                .toString('base64')
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');

            const resGmail = await gmail.users.messages.send({
                userId: 'me',
                requestBody: {
                    raw: encodedMessage,
                    threadId: threadId || undefined
                }
            });

            await ensureTokensSaved();
            return res.status(200).json(resGmail.data);
        }

        return res.status(404).json({ error: 'Action not found' });

    } catch (error) {
        console.error('Gmail API Error:', error);
        if (error.message && (error.message.includes('No refresh token is set') || error.message.includes('invalid_grant'))) {
            return res.status(401).json({ error: 'Authentication expired. Please reconnect Gmail.' });
        }
        return res.status(500).json({ error: error.message });
    }
};
