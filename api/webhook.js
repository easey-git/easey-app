const admin = require("firebase-admin");
const cors = require('cors')({ origin: true }); // Standard CORS

// Helper to run middleware
const runMiddleware = (req, res, fn) => {
    return new Promise((resolve, reject) => {
        fn(req, res, (result) => {
            if (result instanceof Error) return reject(result);
            return resolve(result);
        });
    });
};

// Initialize Firebase Admin (Singleton)
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

// ---------------------------------------------------------
// CONSTANTS & CONFIG
// ---------------------------------------------------------
const CONSTANTS = {
    TEMPLATES: {
        COD_CONFIRMATION: 'cod_auto_confirmation',
        ORDER_CONFIRM_SCHEDULE: 'order_confirm_auto_schedule',
        COD_CONFIRMED: 'cod_confirmed',
        UPDATE_ADDRESS: 'update_address',
        COD_CANCEL: 'cod_cancel',
        CART_RECOVERY: 'cart_recovery'
    },
    PAYLOADS: {
        CONFIRM_YES: ['CONFIRM_COD_YES', 'Confirm Order'],
        CONFIRM_NO: ['CONFIRM_COD_NO', 'Cancel', 'cancel'],
        ADDRESS_CORRECT: ['ADDRESS_CORRECT', 'Confirm Address', 'Yes, Correct', 'Correct'],
        ADDRESS_EDIT: ['ADDRESS_EDIT', 'Make Changes', 'Edit Address']
    },
    DEFAULT_COUNTRY_CODE: '91'
};

// ---------------------------------------------------------
// HELPERS
// ---------------------------------------------------------

/**
 * Normalizes phone number to E.164 format (digits only) without leading +.
 * Defaults to India (91) if no country code is detected on 10-digit numbers.
 */
const normalizePhone = (phone) => {
    if (!phone) return null;
    let p = phone.toString().replace(/\D/g, '');

    // If 10 digits, assume default country code
    if (p.length === 10) {
        p = `${CONSTANTS.DEFAULT_COUNTRY_CODE}${p}`;
    }
    // If 12 digits and starts with 91, it's already good (India specific check, can be generalized)

    return p;
};

/**
 * Sends a WhatsApp Template Message.
 */
const sendWhatsAppMessage = async (to, templateName, components) => {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneId || !to) {
        console.error('WhatsApp Config Error: Missing token, phoneId, or recipient.');
        return;
    }

    try {
        const url = `https://graph.facebook.com/v17.0/${phoneId}/messages`;
        const body = {
            messaging_product: "whatsapp",
            to: to,
            type: "template",
            template: {
                name: templateName,
                language: { code: "en_US" },
                components: components
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        if (!response.ok) {
            console.error(`WhatsApp Error (${templateName}):`, JSON.stringify(data));
            return;
        }

        console.info(`WhatsApp template '${templateName}' sent to ${to}`);

        // Log to Firestore (Fire & Forget)
        db.collection('whatsapp_messages').add({
            phone: to,
            phoneNormalized: normalizePhone(to), // Store normalized for querying
            direction: 'outbound',
            type: 'template',
            body: `Auto-Template: ${templateName}`,
            templateName: templateName,
            timestamp: admin.firestore.Timestamp.now(),
            whatsappId: data.messages?.[0]?.id
        }).catch(err => console.error("Error logging outbound msg:", err));

    } catch (e) {
        console.error('WhatsApp Send Exception:', e);
    }
};

/**
 * Sends FCM Push Notifications in batches.
 */
const sendFCMNotifications = async (title, body, dataPayload) => {
    try {
        const tokensSnapshot = await db.collection('push_tokens').get();
        if (tokensSnapshot.empty) return;

        const pushTokens = tokensSnapshot.docs.map(doc => doc.data().token);
        // Deduplicate tokens
        const uniqueTokens = [...new Set(pushTokens)];

        const messages = uniqueTokens.map(token => ({
            token: token,
            notification: {
                title,
                body
            },
            android: {
                priority: 'high',
            },
            apns: {
                payload: {
                    aps: {
                        sound: 'default'
                    }
                }
            },
            data: dataPayload || {}
        }));

        const batchSize = 500;
        const batches = [];
        for (let i = 0; i < messages.length; i += batchSize) {
            const batch = messages.slice(i, i + batchSize);
            batches.push(admin.messaging().sendEach(batch));
        }

        await Promise.all(batches);
        console.info(`Sent FCM notifications to ${uniqueTokens.length} devices.`);
    } catch (error) {
        console.error('Error sending FCM:', error);
    }
};

// ---------------------------------------------------------
// MAIN HANDLER
// ---------------------------------------------------------

module.exports = async (req, res) => {
    // Handle CORS
    await runMiddleware(req, res, cors);

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 1. WhatsApp Webhook Verification
    if (req.method === 'GET' && req.query['hub.mode'] === 'subscribe') {
        const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
        if (!verifyToken) {
            console.error('WHATSAPP_WEBHOOK_VERIFY_TOKEN is not set in environment variables.');
            return res.status(500).send('Server Configuration Error');
        }

        if (req.query['hub.verify_token'] === verifyToken) {
            return res.status(200).send(req.query['hub.challenge']);
        }
        return res.status(403).send('Forbidden');
    }

    // 2. WhatsApp Incoming Messages
    if (req.method === 'POST' && req.body.object === 'whatsapp_business_account') {
        try {
            const entry = req.body.entry?.[0];
            const changes = entry?.changes?.[0];
            const value = changes?.value;

            if (value?.messages?.[0]) {
                const message = value.messages[0];
                const senderPhone = message.from; // This is usually normalized by WhatsApp (e.g., 919876543210)
                const phoneNormalized = normalizePhone(senderPhone);
                const msgId = message.id;
                const type = message.type;

                let body = '';
                let payload = '';

                if (type === 'text') {
                    body = message.text.body;
                } else if (type === 'button') {
                    body = message.button.text;
                    payload = message.button.payload;
                }

                // Log Inbound Message
                await db.collection('whatsapp_messages').add({
                    id: msgId,
                    phone: senderPhone,
                    phoneNormalized,
                    direction: 'inbound',
                    type,
                    body,
                    payload,
                    raw: JSON.stringify(message),
                    timestamp: admin.firestore.Timestamp.now()
                });

                // ---------------------------------------------------------
                // AUTOMATION LOGIC
                // ---------------------------------------------------------
                if (type === 'button' || type === 'text') {
                    const ordersRef = db.collection('orders');

                    // Helper to find latest COD order using INDEXED QUERY
                    // Requires Composite Index: orders [phoneNormalized: ASC, createdAt: DESC]
                    const findLatestOrder = async () => {
                        const snapshot = await ordersRef
                            .where('phoneNormalized', '==', phoneNormalized)
                            .where('status', '==', 'COD')
                            .orderBy('createdAt', 'desc')
                            .limit(1)
                            .get();

                        if (snapshot.empty) return null;
                        return snapshot.docs[0];
                    };

                    // Check Payloads
                    const isConfirmYes = CONSTANTS.PAYLOADS.CONFIRM_YES.includes(payload) || CONSTANTS.PAYLOADS.CONFIRM_YES.includes(body);
                    const isAddressCorrect = CONSTANTS.PAYLOADS.ADDRESS_CORRECT.includes(payload) || CONSTANTS.PAYLOADS.ADDRESS_CORRECT.includes(body);
                    const isAddressEdit = CONSTANTS.PAYLOADS.ADDRESS_EDIT.includes(payload) || CONSTANTS.PAYLOADS.ADDRESS_EDIT.includes(body);
                    const isCancel = CONSTANTS.PAYLOADS.CONFIRM_NO.includes(payload) || CONSTANTS.PAYLOADS.CONFIRM_NO.includes(body.toLowerCase());

                    // CASE 1: Confirm Order (Step 1)
                    if (isConfirmYes) {
                        let messagePayload = null;

                        await db.runTransaction(async (t) => {
                            const orderDoc = await findLatestOrder();
                            if (!orderDoc) return;

                            const orderRef = ordersRef.doc(orderDoc.id);
                            const freshSnap = await t.get(orderRef);
                            const data = freshSnap.data();

                            // Idempotency Check
                            if (data.verificationStatus === 'verified_pending_address' || data.verificationStatus === 'approved') {
                                console.info(`Order ${orderDoc.id} already processed. Skipping.`);
                                return;
                            }

                            // Update Status
                            t.update(orderRef, {
                                verificationStatus: 'verified_pending_address',
                                updatedAt: admin.firestore.Timestamp.now()
                            });

                            // Prepare Message
                            const address = `${data.address1}, ${data.city}, ${data.state || ''}`;
                            messagePayload = {
                                to: senderPhone,
                                template: CONSTANTS.TEMPLATES.ORDER_CONFIRM_SCHEDULE,
                                components: [
                                    {
                                        type: 'body',
                                        parameters: [
                                            { type: 'text', text: String(data.orderNumber || '') },
                                            { type: 'text', text: address || 'Your Address' },
                                            { type: 'text', text: String(data.zip || '') },
                                            { type: 'text', text: String(data.phone || '') }
                                        ]
                                    }
                                ]
                            };
                        });

                        if (messagePayload) {
                            await sendWhatsAppMessage(messagePayload.to, messagePayload.template, messagePayload.components);
                        }
                    }

                    // CASE 2: Address Correct (Step 2)
                    else if (isAddressCorrect) {
                        let messagePayload = null;

                        await db.runTransaction(async (t) => {
                            const orderDoc = await findLatestOrder();
                            if (!orderDoc) return;

                            const orderRef = ordersRef.doc(orderDoc.id);
                            const freshSnap = await t.get(orderRef);
                            const data = freshSnap.data();

                            if (data.verificationStatus === 'approved') return;

                            t.update(orderRef, {
                                verificationStatus: 'approved',
                                updatedAt: admin.firestore.Timestamp.now()
                            });

                            messagePayload = {
                                to: senderPhone,
                                template: CONSTANTS.TEMPLATES.COD_CONFIRMED,
                                components: [
                                    {
                                        type: 'body',
                                        parameters: [{ type: 'text', text: String(data.orderNumber || '') }]
                                    }
                                ]
                            };
                        });

                        if (messagePayload) {
                            await sendWhatsAppMessage(messagePayload.to, messagePayload.template, messagePayload.components);
                        }
                    }

                    // CASE 3: Make Changes (Step 2)
                    else if (isAddressEdit) {
                        const orderDoc = await findLatestOrder();
                        if (orderDoc) {
                            await ordersRef.doc(orderDoc.id).update({
                                verificationStatus: 'address_change_requested',
                                updatedAt: admin.firestore.Timestamp.now()
                            });
                            await sendWhatsAppMessage(senderPhone, CONSTANTS.TEMPLATES.UPDATE_ADDRESS, [
                                { type: 'body', parameters: [{ type: 'text', text: orderDoc.data().customerName || 'Customer' }] }
                            ]);
                        }
                    }

                    // CASE 4: Cancel Order
                    else if (isCancel) {
                        const orderDoc = await findLatestOrder();
                        if (orderDoc) {
                            await ordersRef.doc(orderDoc.id).update({
                                status: 'CANCELLED',
                                verificationStatus: 'cancelled',
                                updatedAt: admin.firestore.Timestamp.now()
                            });
                            await sendWhatsAppMessage(senderPhone, CONSTANTS.TEMPLATES.COD_CANCEL, [
                                {
                                    type: 'body', parameters: [
                                        { type: 'text', text: orderDoc.data().customerName || 'Customer' },
                                        { type: 'text', text: String(orderDoc.data().orderNumber || '') }
                                    ]
                                }
                            ]);
                        }
                    }
                }

                return res.status(200).send('EVENT_RECEIVED');
            }

            // 3. Handle Status Updates (Sent, Delivered, Read)
            if (value?.statuses?.[0]) {
                const statusUpdate = value.statuses[0];
                const whatsappId = statusUpdate.id;
                const newStatus = statusUpdate.status; // sent, delivered, read, failed

                // Find the message with this WhatsApp ID
                const msgQuery = await db.collection('whatsapp_messages')
                    .where('whatsappId', '==', whatsappId)
                    .limit(1)
                    .get();

                if (!msgQuery.empty) {
                    const msgDoc = msgQuery.docs[0];
                    const updateData = { status: newStatus };

                    if (newStatus === 'read') {
                        updateData.readTimestamp = admin.firestore.Timestamp.now();
                    }

                    if (newStatus === 'failed' && statusUpdate.errors) {
                        updateData.failureReason = statusUpdate.errors; // Save error details
                        console.error(`Message ${whatsappId} failed:`, JSON.stringify(statusUpdate.errors));
                    }

                    await msgDoc.ref.update(updateData);
                    console.info(`Updated message ${whatsappId} to status: ${newStatus}`);
                } else {
                    console.warn(`Message not found for status update: ${whatsappId}`);
                }

                return res.status(200).send('STATUS_RECEIVED');
            }

        } catch (error) {
            console.error("WhatsApp Webhook Error:", error);
            return res.status(500).send("Error");
        }
    }

    // 3. Shopify / Shiprocket Webhook
    if (!req.body.object) {
        try {
            const data = req.body;
            const queryParams = req.query || {};

            // A. SHIPROCKET / ABANDONED CART
            if (data.cart_id || data.latest_stage) {
                const checkoutId = data.cart_id || "";
                const phoneNormalized = normalizePhone(data.phone_number);
                let eventType = queryParams.abandoned === "1" ? "ABANDONED" : "ACTIVE_CART";

                // Save Checkout Data
                const docId = checkoutId ? `checkout_${checkoutId}` : `unknown_${Date.now()}`;
                await db.collection("checkouts").doc(docId).set({
                    ...data,
                    eventType,
                    phoneNormalized,
                    updatedAt: admin.firestore.Timestamp.now(),
                    rawJson: JSON.stringify(data)
                }, { merge: true });

                // Abandoned Cart Recovery
                if (eventType === 'ABANDONED' && phoneNormalized && data.total_price > 0) {
                    const checkoutUrl = data.cart_attributes?.landing_page_url || `https://yourstore.com/cart`;
                    await sendWhatsAppMessage(phoneNormalized, CONSTANTS.TEMPLATES.CART_RECOVERY, [
                        {
                            type: 'body',
                            parameters: [
                                { type: 'text', text: data.first_name || 'Shopper' },
                                { type: 'text', text: String(data.total_price || '0') },
                                { type: 'text', text: checkoutUrl }
                            ]
                        }
                    ]);
                }

                // Push Notification
                const customerName = data.first_name ? `${data.first_name} ${data.last_name || ''}` : 'Visitor';
                await sendFCMNotifications(
                    'New Live Activity',
                    `${customerName} is active: ${data.latest_stage || 'Browsing'}`,
                    { checkoutId, type: 'live_activity' }
                );

                return res.status(200).send("OK");
            }

            // B. SHOPIFY ORDER CREATION
            if (data.order_number) {
                const orderId = String(data.id);
                const orderRef = db.collection("orders").doc(orderId);
                const rawPhone = data.phone || data.customer?.phone || data.shipping_address?.phone;
                const phoneNormalized = normalizePhone(rawPhone);

                // 1. Save Order (Idempotent Set)
                const orderData = {
                    orderId: data.id,
                    orderNumber: data.order_number,
                    totalPrice: parseFloat(data.total_price),
                    currency: data.currency || 'INR',
                    customerName: data.customer ? `${data.customer.first_name} ${data.customer.last_name}` : "Guest",
                    email: data.email || null,
                    phone: rawPhone || null,
                    phoneNormalized: phoneNormalized, // CRITICAL: Save normalized phone for querying
                    status: (data.gateway?.toLowerCase().includes('cod') || data.payment_gateway_names?.some(n => n.toLowerCase().includes('cod'))) ? "COD" : "Paid",
                    items: data.line_items?.map(i => ({ name: i.name, quantity: i.quantity, price: i.price })) || [],
                    address1: data.shipping_address?.address1 || "",
                    city: data.shipping_address?.city || "",
                    state: data.shipping_address?.province || "",
                    zip: data.shipping_address?.zip || "",
                    createdAt: admin.firestore.Timestamp.now(),
                    updatedAt: admin.firestore.Timestamp.now()
                };

                await orderRef.set(orderData, { merge: true });

                // 2. Parallelize Side Effects (Cleanup, WhatsApp, FCM)
                // This prevents independent tasks from blocking each other
                const tasks = [];

                // Task A: Cleanup Carts
                if (phoneNormalized || data.email) {
                    tasks.push((async () => {
                        try {
                            const batch = db.batch();
                            const checkoutsRef = db.collection("checkouts");
                            let queryRefs = [];

                            if (data.checkout_token) queryRefs.push(checkoutsRef.where("shopifyCartToken", "==", data.checkout_token));
                            if (data.email) queryRefs.push(checkoutsRef.where("email", "==", data.email));
                            if (phoneNormalized) queryRefs.push(checkoutsRef.where("phoneNormalized", "==", phoneNormalized));

                            const snapshots = await Promise.all(queryRefs.map(q => q.get()));
                            const docsToDelete = new Set();
                            snapshots.forEach(snap => snap.docs.forEach(doc => docsToDelete.add(doc.ref.path)));

                            docsToDelete.forEach(path => batch.delete(db.doc(path)));
                            if (docsToDelete.size > 0) await batch.commit();
                        } catch (err) {
                            console.error('[Cleanup] Error:', err.message);
                        }
                    })());
                }

                // Task B: Send COD Confirmation
                if (orderData.status === 'COD' && phoneNormalized) {
                    tasks.push((async () => {
                        try {
                            let messagePayload = null;
                            await db.runTransaction(async (t) => {
                                const freshDoc = await t.get(orderRef);
                                if (freshDoc.exists && freshDoc.data().whatsappSent) {
                                    return; // Already sent
                                }
                                t.update(orderRef, { whatsappSent: true });

                                const itemName = orderData.items[0]?.name || 'Your Order';
                                messagePayload = {
                                    to: phoneNormalized,
                                    template: CONSTANTS.TEMPLATES.COD_CONFIRMATION,
                                    components: [
                                        {
                                            type: 'body',
                                            parameters: [
                                                { type: 'text', text: orderData.customerName || 'Customer' },
                                                { type: 'text', text: String(orderData.orderNumber || '') },
                                                { type: 'text', text: itemName },
                                                { type: 'text', text: String(orderData.totalPrice || '0') }
                                            ]
                                        }
                                    ]
                                };
                            });

                            if (messagePayload) {
                                await sendWhatsAppMessage(messagePayload.to, messagePayload.template, messagePayload.components);
                            }
                        } catch (err) {
                            console.error('[WhatsApp] Error:', err.message);
                        }
                    })());
                }

                // Task C: Send Push Notification
                tasks.push(sendFCMNotifications(
                    'New Order Received! 💰',
                    `Order #${data.order_number} from ${orderData.customerName} - ₹${data.total_price}`,
                    { orderId, type: 'new_order' }
                ));

                // Wait for all side effects to complete (non-blocking for individual tasks)
                await Promise.allSettled(tasks);

                return res.status(200).json({ success: true });
            }

            return res.status(200).json({ message: "No action taken" });

        } catch (error) {
            console.error("Webhook Error:", error);
            return res.status(500).json({ error: error.message });
        }
    }

    res.status(200).send("Active 🟢");
};
