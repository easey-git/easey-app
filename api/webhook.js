const admin = require("firebase-admin");

// Initialize Firebase Admin if it hasn't been initialized yet
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    });
}

const db = admin.firestore();

module.exports = async (req, res) => {
    // ---------------------------------------------------------
    // 0. WHATSAPP WEBHOOK VERIFICATION (GET)
    // ---------------------------------------------------------
    if (req.method === 'GET' && req.query['hub.mode'] === 'subscribe') {
        const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'easeycrm_whatsapp_verify';
        if (req.query['hub.verify_token'] === verifyToken) {
            console.log("WhatsApp Webhook Verified!");
            return res.status(200).send(req.query['hub.challenge']);
        }
        return res.status(403).send('Forbidden');
    }

    // ---------------------------------------------------------
    // 1. WHATSAPP INCOMING MESSAGES (POST)
    // ---------------------------------------------------------
    if (req.method === 'POST' && req.body.object === 'whatsapp_business_account') {
        try {
            const entry = req.body.entry?.[0];
            const changes = entry?.changes?.[0];
            const value = changes?.value;

            if (value?.messages?.[0]) {
                const message = value.messages[0];
                const senderPhone = message.from; // e.g., "919876543210"
                const phoneNormalized = senderPhone.replace(/\D/g, '').slice(-10);
                const msgId = message.id;
                const timestamp = admin.firestore.Timestamp.now();

                let body = '';
                let type = message.type;

                if (type === 'text') {
                    body = message.text.body;
                } else if (type === 'button') {
                    body = message.button.text; // The text on the button
                    const payload = message.button.payload; // The hidden payload

                    // AUTOMATION: Handle COD Confirmation
                    if (payload === 'CONFIRM_COD_YES') {
                        console.log(`Auto-verifying COD order for ${phoneNormalized}`);
                        // Find pending COD order for this phone
                        const ordersRef = db.collection('orders');
                        const snapshot = await ordersRef
                            .where('status', '==', 'COD')
                            .where('verificationStatus', '!=', 'approved') // Only pending
                            .orderBy('createdAt', 'desc')
                            .limit(5) // Check last 5 to be safe
                            .get();

                        // Filter client-side for phone match (since we might store phone differently)
                        const matchingOrder = snapshot.docs.find(doc => {
                            const p = doc.data().phone || '';
                            return p.replace(/\D/g, '').slice(-10) === phoneNormalized;
                        });

                        if (matchingOrder) {
                            await ordersRef.doc(matchingOrder.id).update({
                                verificationStatus: 'approved',
                                updatedAt: timestamp
                            });
                            // Optional: Send "Thank you" reply via API (not implemented here yet)
                        }
                    }
                }

                // Save to Firestore for Chat View
                await db.collection('whatsapp_messages').add({
                    id: msgId,
                    phone: senderPhone,
                    phoneNormalized: phoneNormalized,
                    direction: 'inbound',
                    type: type,
                    body: body,
                    raw: JSON.stringify(message),
                    timestamp: timestamp
                });

                return res.status(200).send('EVENT_RECEIVED');
            }

            // Handle Status Updates (Sent, Delivered, Read) - Optional for now
            if (value?.statuses?.[0]) {
                return res.status(200).send('STATUS_RECEIVED');
            }

        } catch (error) {
            console.error("Error processing WhatsApp webhook:", error);
            return res.status(500).send("Error");
        }
    }

    // 1. Handle Shopify/Shiprocket POST
    if (req.method === 'POST') {
        try {
            const data = req.body;
            const queryParams = req.query || {};

            // ---------------------------------------------------------
            // A. SHIPROCKET CHECKOUT / ABANDONED CART
            // ---------------------------------------------------------
            // Detect if it's a Shiprocket event (has cart_id or latest_stage)
            if (data.cart_id || data.latest_stage) {

                // 1. Determine Event Type & Stage
                let eventType = "ACTIVE_CART";
                let stage = data.latest_stage || "BROWSING";

                if (queryParams.abandoned === "1") {
                    eventType = "ABANDONED";
                    stage = "CHECKOUT_ABANDONED"; // Explicitly mark as abandoned
                }

                // Map technical stages to human readable text
                const stageMap = {
                    "PHONE_RECEIVED": "Entered Phone",
                    "EMAIL_RECEIVED": "Entered Email",
                    "ADDRESS_RECEIVED": "Entered Address",
                    "PAYMENT_INITIATED": "Payment Started",
                    "OTP_VERIFIED": "OTP Verified"
                };
                const readableStage = stageMap[stage] || stage;

                const checkoutId = data.cart_id || "";
                const orderId = data.order_id || "";

                // 2. Extract Data
                const amount = data.total_price || 0;
                const currency = data.currency || "INR";
                const address = data.shipping_address || data.billing_address || {};

                // Name Logic: Try Name -> Phone -> "Visitor"
                let firstName = data.first_name || address.first_name || "";
                let lastName = data.last_name || address.last_name || "";
                let customerName = `${firstName} ${lastName}`.trim();

                const phone = data.phone_number || "";
                const phoneNormalized = phone ? phone.replace(/\D/g, '').slice(-10) : null;

                if (!customerName && phone) {
                    // Mask phone: 7488377378 -> 74883...378
                    customerName = `Visitor (${phone.slice(0, 5)}...)`;
                } else if (!customerName) {
                    customerName = "Visitor";
                }

                const email = data.email || "";

                // Items Logic
                let items = null;
                if (Array.isArray(data.items) && data.items.length > 0) {
                    items = data.items.map(i => ({
                        name: i.name || i.title || "Unknown Item",
                        quantity: i.quantity || 1,
                        price: i.price || 0,
                        image: i.image || null
                    }));
                }

                const city = address.city || "";
                const state = address.state || "";
                const pincode = address.zip || "";

                // Marketing Data (UTM) & Cart Token
                const attributes = data.cart_attributes || {};
                const shopifyCartToken = attributes.shopifyCartToken || null;
                let source = data.source_name || "Direct";

                // Try to extract UTM from landing_page_url if available
                if (attributes.landing_page_url) {
                    try {
                        const url = new URL(attributes.landing_page_url);
                        const utmSource = url.searchParams.get("utm_source");
                        const utmMedium = url.searchParams.get("utm_medium");
                        if (utmSource) source = `${utmSource} / ${utmMedium || ''}`;
                    } catch (e) {
                        // Ignore URL parsing errors
                    }
                }

                // 3. Duplicate Prevention & Save to Firestore
                const docId = checkoutId ? `checkout_${checkoutId}` : `unknown_${Date.now()}`;
                const docRef = db.collection("checkouts").doc(docId);

                // Check existing state to prevent regression (e.g. ORDER_PLACED -> PAYMENT_INITIATED)
                const docSnap = await docRef.get();
                if (docSnap.exists) {
                    const existingData = docSnap.data();
                    if (existingData.latest_stage === 'ORDER_PLACED' && stage === 'PAYMENT_INITIATED') {
                        console.log(`Ignoring PAYMENT_INITIATED for ${docId} as it is already ORDER_PLACED`);
                        return res.status(200).send("OK");
                    }
                }

                const checkoutData = {
                    eventType,
                    latest_stage: stage, // Save raw stage for logic
                    stage: readableStage, // Save readable stage for display
                    checkoutId,
                    shopifyCartToken, // Save token to link with Order later
                    orderId,
                    totalPrice: amount, // Standardize to totalPrice
                    currency,
                    customerName,
                    email,
                    phone,
                    phoneNormalized, // For smart matching
                    city,
                    state,
                    pincode,
                    source, // Marketing Source
                    ip: attributes.ipv4_address || null,
                    updatedAt: admin.firestore.Timestamp.now(),
                    rawJson: JSON.stringify(data)
                };

                // Only update items if we have valid item data (prevents overwriting with empty/placeholder)
                if (items) {
                    checkoutData.items = items;
                }

                await docRef.set(checkoutData, { merge: true });

                console.log(`Shiprocket Event: ${eventType} (${readableStage}) for ${customerName}`);

                // ---------------------------------------------------------
                // SEND PUSH NOTIFICATION (FCM for Production Builds)
                // ---------------------------------------------------------
                try {
                    console.log('Fetching push tokens from Firestore...');
                    // Fetch all registered push tokens
                    const tokensSnapshot = await db.collection('push_tokens').get();
                    const pushTokens = tokensSnapshot.docs.map(doc => doc.data().token);
                    console.log(`Found ${pushTokens.length} push tokens:`, pushTokens.map(t => t.substring(0, 20) + '...'));

                    if (pushTokens.length === 0) {
                        console.log('No push tokens found, skipping notification');
                        return res.status(200).send("OK");
                    }

                    // Send FCM notifications
                    const messages = pushTokens.map(token => ({
                        token: token,
                        notification: {
                            title: 'New Live Activity',
                            body: `${customerName} is active: ${readableStage}`,
                        },
                        android: {
                            notification: {
                                sound: 'live',  // Without .mp3 extension for Android
                                channelId: 'custom-sound-v2',
                            }
                        },
                        data: {
                            checkoutId: checkoutId || '',
                            type: 'live_activity'
                        }
                    }));

                    console.log('Sending FCM notifications...');
                    // Send in batches (FCM allows 500 per batch)
                    const batchSize = 500;
                    for (let i = 0; i < messages.length; i += batchSize) {
                        const batch = messages.slice(i, i + batchSize);
                        const result = await admin.messaging().sendEach(batch);
                        console.log(`Batch ${i / batchSize + 1} result:`, {
                            successCount: result.successCount,
                            failureCount: result.failureCount,
                            responses: result.responses.map(r => ({ success: r.success, error: r.error?.message }))
                        });
                    }

                    console.log(`Sent ${messages.length} FCM push notifications`);
                } catch (error) {
                    console.error('Error sending push notifications:', error);
                }

                return res.status(200).send("OK");
            }

            // ---------------------------------------------------------
            // B. SHOPIFY ORDER CREATION (Fallback)
            // ---------------------------------------------------------
            if (data.order_number) {
                const shipping = data.shipping_address || {};

                console.log(`Order ${data.order_number} Gateway: ${data.gateway}, Payment Names: ${JSON.stringify(data.payment_gateway_names)}`);

                const orderData = {
                    orderId: data.id,
                    orderNumber: data.order_number,
                    totalPrice: data.total_price,
                    currency: data.currency,
                    customerName: data.customer ? `${data.customer.first_name} ${data.customer.last_name}` : "Guest",
                    email: data.email,
                    phone: data.phone || (data.customer ? data.customer.phone : null),
                    createdAt: admin.firestore.Timestamp.now(),
                    updatedAt: admin.firestore.Timestamp.now(),
                    status: (
                        (data.gateway && (data.gateway.toLowerCase().includes('cash') || data.gateway.toLowerCase().includes('cod') || data.gateway.toLowerCase().includes('manual'))) ||
                        (data.payment_gateway_names && data.payment_gateway_names.some(name => name.toLowerCase().includes('cash') || name.toLowerCase().includes('cod') || name.toLowerCase().includes('manual')))
                    ) ? "COD" : "Paid",
                    paymentMethod: data.gateway || "Unknown",

                    // Address Details
                    address1: shipping.address1 || "",
                    city: shipping.city || "",
                    province: shipping.province || "",
                    zip: shipping.zip || "",
                    country: shipping.country || "",

                    items: data.line_items.map(item => ({
                        name: item.title,
                        quantity: item.quantity,
                        price: item.price
                    }))
                };

                // 1. Save Order
                await db.collection("orders").doc(String(data.id)).set(orderData);

                // 2. CLEANUP: Robust "Industry Standard" Cart Removal
                // We try to find the cart by Token, Email, or Phone and delete it.
                // This ensures no "stuck" active carts after a purchase.

                const batch = db.batch();
                let docsToDelete = new Set();

                // A. Match by Token (Most accurate)
                if (data.checkout_token) {
                    const tokenQuery = await db.collection("checkouts")
                        .where("shopifyCartToken", "==", data.checkout_token)
                        .get();
                    tokenQuery.docs.forEach(doc => docsToDelete.add(doc.ref));
                }

                // B. Match by Email (Fallback)
                if (data.email) {
                    const emailQuery = await db.collection("checkouts")
                        .where("email", "==", data.email)
                        .get();
                    emailQuery.docs.forEach(doc => docsToDelete.add(doc.ref));
                }

                // Helper to normalize phone (last 10 digits)
                const normalizePhone = (p) => {
                    if (!p) return null;
                    const digits = p.replace(/\D/g, '');
                    return digits.slice(-10);
                };

                // C. Match by Phone (Shotgun Approach)
                // We search for the phone in multiple formats against the 'phone' field
                // to catch cases where the data was saved differently.
                const rawPhone = data.phone || (data.customer ? data.customer.phone : null);

                if (rawPhone) {
                    const phoneVariations = new Set();

                    // 1. Exact Match
                    phoneVariations.add(rawPhone);

                    // 2. Without +91 (if present)
                    if (rawPhone.includes('+91')) {
                        phoneVariations.add(rawPhone.replace('+91', ''));
                    }

                    // 3. Last 10 Digits (Normalized)
                    const normalized = normalizePhone(rawPhone);
                    if (normalized) {
                        phoneVariations.add(normalized);
                        // Also try adding +91 to normalized
                        phoneVariations.add(`+91${normalized}`);
                    }

                    // Run queries for ALL variations
                    for (const phoneVar of phoneVariations) {
                        // Query against the standard 'phone' field
                        const query1 = await db.collection("checkouts").where("phone", "==", phoneVar).get();
                        query1.docs.forEach(doc => docsToDelete.add(doc.ref));

                        // Query against the new 'phoneNormalized' field (if it exists)
                        if (normalized) {
                            const query2 = await db.collection("checkouts").where("phoneNormalized", "==", normalized).get();
                            query2.docs.forEach(doc => docsToDelete.add(doc.ref));
                        }
                    }
                }

                // Execute Delete Batch
                if (docsToDelete.size > 0) {
                    docsToDelete.forEach(ref => batch.delete(ref));
                    await batch.commit();
                    console.log(`Cleaned up ${docsToDelete.size} cart(s) for Order ${data.order_number}`);
                } else {
                    console.log(`No matching active carts found for Order ${data.order_number}`);
                    // Optional: Log what we tried to find for debugging
                    console.log(`Tried matching: Token=${data.checkout_token}, Email=${data.email}, Phone=${rawPhone}`);
                }

                console.log(`Shopify Order ${data.order_number} saved.`);

                // ---------------------------------------------------------
                // SEND PUSH NOTIFICATION (FCM for Production Builds)
                // ---------------------------------------------------------
                try {
                    console.log('Fetching push tokens for order notification...');
                    const tokensSnapshot = await db.collection('push_tokens').get();
                    const pushTokens = tokensSnapshot.docs.map(doc => doc.data().token);
                    console.log(`Found ${pushTokens.length} push tokens for order`);

                    if (pushTokens.length === 0) {
                        console.log('No push tokens found for order, skipping notification');
                        return res.status(200).json({ success: true });
                    }

                    const messages = pushTokens.map(token => ({
                        token: token,
                        notification: {
                            title: 'New Order Received! 💰',
                            body: `Order #${data.order_number} from ${data.customer ? data.customer.first_name : 'Guest'} - ₹${data.total_price}`,
                        },
                        android: {
                            notification: {
                                sound: 'live',  // Without .mp3 extension for Android
                                channelId: 'custom-sound-v2',
                            }
                        },
                        data: {
                            orderId: String(data.id),
                            type: 'new_order'
                        }
                    }));

                    console.log('Sending order FCM notifications...');
                    // Send in batches
                    const batchSize = 500;
                    for (let i = 0; i < messages.length; i += batchSize) {
                        const batch = messages.slice(i, i + batchSize);
                        const result = await admin.messaging().sendEach(batch);
                        console.log(`Order notification batch result:`, {
                            successCount: result.successCount,
                            failureCount: result.failureCount
                        });
                    }

                    console.log(`Sent ${messages.length} FCM order notifications`);
                } catch (error) {
                    console.error('Error sending order push notifications:', error);
                }

                return res.status(200).json({ success: true });
            }

            return res.status(200).json({ message: "Webhook received but no action taken" });

        } catch (error) {
            console.error("Error processing webhook:", error);
            return res.status(500).json({ error: "Internal Server Error" });
        }
    }

    // Handle GET requests (Health check)
    res.status(200).send("Easey CRM Webhook Listener is Active 🟢");
};
