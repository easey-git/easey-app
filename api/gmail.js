const { google } = require('googleapis');
const admin = require("firebase-admin");
const cors = require('cors')({ origin: true });

// Initialize Firebase Admin if not already initialized
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

// OAuth2 Configuration
// These should be set in your environment variables
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
// Redirect URI is dynamic based on the request (Expo handle)

const oauth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    // Redirect URI will be set per request
);

// Helpers
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

module.exports = async (req, res) => {
    await runMiddleware(req, res, cors);

    const { method } = req;
    const { action } = req.query; // ?action=auth|list|get|send

    try {
        // 1. AUTHENTICATION (Exchange Code)
        if (method === 'POST' && action === 'auth') {
            const { code, redirectUri, userId, codeVerifier } = req.body;

            if (!code || !redirectUri || !userId) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            // Create a new client instance for this request with the correct redirect URI
            const authClient = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, redirectUri);

            const { tokens } = await authClient.getToken({
                code,
                codeVerifier
            });

            // Store tokens (access_token, refresh_token, scope, expiry_date)
            await storeTokens(userId, tokens);

            return res.status(200).json({ success: true });
        }

        // 2. CHECK STATUS
        if (method === 'GET' && action === 'status') {
            const { userId } = req.query;
            const tokens = await getTokens(userId);
            return res.status(200).json({ connected: !!tokens });
        }

        // --- MIDDLEWARE FOR API CALLS ---
        // Verify User & Load Tokens
        const userId = req.query.userId || req.body.userId;
        if (!userId) return res.status(400).json({ error: 'User ID required' });

        const storedTokens = await getTokens(userId);
        if (!storedTokens) return res.status(401).json({ error: 'Gmail not connected' });

        oauth2Client.setCredentials(storedTokens);

        // Handle Token Refresh Automatically
        oauth2Client.on('tokens', (tokens) => {
            if (tokens.refresh_token) {
                storeTokens(userId, tokens);
            } else {
                // If no new refresh token, merge with existing
                storeTokens(userId, Object.assign({}, storedTokens, tokens));
            }
        });

        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        // 3. LIST THREADS
        if (method === 'GET' && action === 'list') {
            const response = await gmail.users.threads.list({
                userId: 'me',
                maxResults: 50,
                q: req.query.q || '' // Search query
            });

            const threads = response.data.threads || [];

            // Fetch validation snippet/details for each thread (batching usually better but keeping simple)
            // To be efficient, we only return IDs and snippets unless full details needed
            // Actually, the list response includes snippets.
            // But let's fetch 'messages' for the first message to get headers (Subject, From)

            const detailedThreads = await Promise.all(threads.map(async (thread) => {
                const threadDetails = await gmail.users.threads.get({
                    userId: 'me',
                    id: thread.id,
                    format: 'metadata',
                    metadataHeaders: ['Subject', 'From', 'Date']
                });

                const messages = threadDetails.data.messages || [];
                const lastMessage = messages[messages.length - 1]; // Get latest
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
            }));

            return res.status(200).json({ threads: detailedThreads });
        }

        // 4. GET THREAD DETAILS (Read Email)
        if (method === 'GET' && action === 'get') {
            const { id } = req.query;
            const response = await gmail.users.threads.get({
                userId: 'me',
                id: id,
                format: 'full' // Get full content
            });
            return res.status(200).json(response.data);
        }

        // 5. SEND EMAIL
        if (method === 'POST' && action === 'send') {
            const { to, subject, body, threadId } = req.body;

            // Construct MIME message
            const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
            const messageParts = [
                `To: ${to}`,
                'Content-Type: text/html; charset=utf-8',
                'MIME-Version: 1.0',
                `Subject: ${utf8Subject}`,
                '',
                body
            ];

            // If replying, add In-Reply-To or References if needed (simplified here)
            // Proper reply requires fetching the original 'Message-ID' and adding it to 'References' and 'In-Reply-To'

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

            return res.status(200).json(resGmail.data);
        }

        return res.status(404).json({ error: 'Action not found' });

    } catch (error) {
        console.error('Gmail API Error:', error);
        return res.status(500).json({ error: error.message });
    }
};
