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

// Oauth2 client initialized per request


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

    // Create OAuth2 client per request to avoid global state issues
    const oauth2Client = new google.auth.OAuth2(
        CLIENT_ID,
        CLIENT_SECRET,
        // Redirect URI will be set dynamically if needed, or default
        "https://easey-app.vercel.app/api/gmail" // Fallback or dynamic
    );

    try {
        // 1. AUTHENTICATION (Exchange Code)
        if (method === 'POST' && action === 'auth') {
            const { code, redirectUri, userId, codeVerifier } = req.body;

            if (!code || !redirectUri || !userId) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            // Create a dedicated client for validation with the specific redirectUri used in frontend
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
            // Check if we have a refresh token
            return res.status(200).json({ connected: !!tokens && !!tokens.refresh_token });
        }

        // --- MIDDLEWARE FOR API CALLS ---
        // Verify User & Load Tokens
        const userId = req.query.userId || req.body.userId;
        if (!userId) return res.status(400).json({ error: 'User ID required' });

        const storedTokens = await getTokens(userId);
        if (!storedTokens) return res.status(401).json({ error: 'Gmail not connected' });



        oauth2Client.setCredentials(storedTokens);

        // Helper to sync tokens manually
        const ensureTokensSaved = async () => {
            const currentTokens = oauth2Client.credentials;
            // If the current tokens are different (e.g. refreshed), save them
            if (currentTokens && currentTokens.access_token !== storedTokens.access_token) {
                console.log('Tokens refreshed during execution, saving...');
                await storeTokens(userId, { ...storedTokens, ...currentTokens });
            }
        };

        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        // 3. LIST THREADS
        if (method === 'GET' && action === 'list') {
            const response = await gmail.users.threads.list({
                userId: 'me',
                maxResults: 20, // Keep individual page size manageable
                pageToken: req.query.pageToken || undefined, // Support pagination
                q: req.query.q || '',
                includeSpamTrash: true // Include Spam and Trash in results
            });

            // Sync tokens after API call (fetching might trigger refresh)
            await ensureTokensSaved();

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

            return res.status(200).json({
                threads: detailedThreads,
                nextPageToken: response.data.nextPageToken
            });
        }

        // 4. GET THREAD DETAILS (Read Email)
        if (method === 'GET' && action === 'get') {
            const { id } = req.query;
            const response = await gmail.users.threads.get({
                userId: 'me',
                id: id,
                format: 'full' // Get full content
            });
            await ensureTokensSaved();
            return res.status(200).json(response.data);
        }

        // 5. ATTACHMENT (Download)
        if (method === 'GET' && action === 'attachment') {
            const { messageId, attachmentId } = req.query;
            if (!messageId || !attachmentId) return res.status(400).json({ error: 'Missing attachment params' });

            const response = await gmail.users.messages.attachments.get({
                userId: 'me',
                messageId,
                id: attachmentId
            });
            await ensureTokensSaved();
            return res.status(200).json(response.data); // Returns { data: "base64...", size: 123 }
        }

        // 6. MODIFY MESSAGE (Archive, Trash, Read)
        if (method === 'POST' && action === 'modify') {
            const { threadId, addLabelIds = [], removeLabelIds = [] } = req.body;

            if (!threadId) return res.status(400).json({ error: 'Thread ID required' });

            // We need to modify all messages in the thread usually, or just the thread itself. 
            // The batchModify endpoint works on a list of IDs.
            // First get the thread to find message IDs? Or just modify the thread directly?
            // "users.threads.modify" is what we want.

            const response = await gmail.users.threads.modify({
                userId: 'me',
                id: threadId,
                requestBody: {
                    addLabelIds,
                    removeLabelIds
                }
            });

            await ensureTokensSaved();
            return res.status(200).json(response.data);
        }

        // 7. SEND EMAIL (With Attachments Support)
        if (method === 'POST' && action === 'send') {
            const { to, subject, body, threadId, attachments = [] } = req.body;

            // Construct Multipart MIME message
            const boundary = "__easey_boundary__";
            const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;

            let messageParts = [];
            messageParts.push(`To: ${to}`);
            messageParts.push(`Subject: ${utf8Subject}`);
            messageParts.push('MIME-Version: 1.0');
            messageParts.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
            messageParts.push('');

            // Body Part
            messageParts.push(`--${boundary}`);
            messageParts.push('Content-Type: text/html; charset=utf-8');
            messageParts.push('');
            messageParts.push(body);
            messageParts.push('');

            // Attachments Parts
            if (attachments && attachments.length > 0) {
                for (const file of attachments) {
                    messageParts.push(`--${boundary}`);
                    messageParts.push(`Content-Type: ${file.mimeType}; name="${file.name}"`);
                    messageParts.push(`Content-Disposition: attachment; filename="${file.name}"`);
                    messageParts.push(`Content-Transfer-Encoding: base64`);
                    messageParts.push('');
                    messageParts.push(file.data); // Base64 data
                    messageParts.push('');
                }
            }

            messageParts.push(`--${boundary}--`);

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

            await ensureTokensSaved();
            return res.status(200).json(resGmail.data);
        }

        return res.status(404).json({ error: 'Action not found' });

    } catch (error) {
        console.error('Gmail API Error:', error);
        // Handle specific error for missing refresh token
        if (error.message && (error.message.includes('No refresh token is set') || error.message.includes('invalid_grant'))) {
            return res.status(401).json({ error: 'Authentication expired. Please reconnect Gmail.' });
        }
        return res.status(500).json({ error: error.message });
    }
};
