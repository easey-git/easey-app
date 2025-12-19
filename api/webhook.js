const admin = require("firebase-admin");

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
// HELPERS
// ---------------------------------------------------------

/**
 * Sends a WhatsApp Template Message.
 */
const sendWhatsAppMessage = async (to, templateName, components) => {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneId || !to) return;

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
            console.error(`WhatsApp Error (${templateName}):`, data);
            return;
        }

        console.log(`WhatsApp template '${templateName}' sent to ${to}`);

        // Log to Firestore (Fire & Forget)
        db.collection('whatsapp_messages').add({
            phone: to,
            phoneNormalized: to.replace(/\D/g, '').slice(-10),
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
        const messages = pushTokens.map(token => ({
            token: token,
            notification: { title, body },
            android: {
                notification: {
                    sound: 'live',
                    channelId: 'custom-sound-v2',
                }
            },
            data: dataPayload
        }));

        const batchSize = 500;
        const batches = [];
        for (let i = 0; i < messages.length; i += batchSize) {
            const batch = messages.slice(i, i + batchSize);
            batches.push(admin.messaging().sendEach(batch));
        }

        await Promise.all(batches);
        console.log(`Sent FCM notifications to ${pushTokens.length} devices.`);
    } catch (error) {
        console.error('Error sending FCM:', error);
    }
};

/**
 * Normalizes phone number to last 10 digits.
 */
const normalizePhone = (phone) => {
    if (!phone) return null;
    return phone.replace(/\D/g, '').slice(-10);
};

// ---------------------------------------------------------
// MAIN HANDLER
// ---------------------------------------------------------

module.exports = async (req, res) => {
    // 1. WhatsApp Webhook Verification
    if (req.method === 'GET' && req.query['hub.mode'] === 'subscribe') {
        const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'easeycrm_whatsapp_verify';
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
                const senderPhone = message.from;
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
                    payload, // Log payload for debugging
                    raw: JSON.stringify(message),
                    timestamp: admin.firestore.Timestamp.now()
                });

                // ---------------------------------------------------------
                // AUTOMATION LOGIC
                // ---------------------------------------------------------
                if (type === 'button') {
                    const ordersRef = db.collection('orders');

                    // Helper to find latest COD order
                    const findLatestOrder = async () => {
                        const snapshot = await ordersRef
                            .orderBy('createdAt', 'desc')
                            .limit(20) // Limit search space for performance
                            .get();

                        return snapshot.docs.find(doc => {
                            const data = doc.data();
                            const p = normalizePhone(data.phone);
                            return p === phoneNormalized && data.status === 'COD';
                        });
                    };

                    // CASE 1: Confirm Order (Step 1)
                    if (payload === 'CONFIRM_COD_YES' || payload === 'Confirm Order' || body === 'Confirm Order') {
                        let messagePayload = null;

                        await db.runTransaction(async (t) => {
                            const orderDoc = await findLatestOrder();
                            if (!orderDoc) return;

                            const orderRef = ordersRef.doc(orderDoc.id);
                            const freshSnap = await t.get(orderRef);
                            const data = freshSnap.data();

                            // Idempotency Check
                            if (data.verificationStatus === 'verified_pending_address' || data.verificationStatus === 'approved') {
                                console.log(`Order ${orderDoc.id} already processed. Skipping.`);
                                return;
                            }

                            // Update Status
                            t.update(orderRef, {
                                verificationStatus: 'verified_pending_address',
                                updatedAt: admin.firestore.Timestamp.now()
                            });

                            // Prepare Message (Don't send yet)
                            const address = `${data.address1}, ${data.city}, ${data.state || ''}`;
                            messagePayload = {
                                to: senderPhone,
                                template: 'order_confirm_auto_schedule',
                                components: [
                                    {
                                        type: 'body',
                                        parameters: [
                                            { type: 'text', text: String(data.orderNumber) },
                                            { type: 'text', text: address },
                                            { type: 'text', text: String(data.zip) },
                                            { type: 'text', text: String(data.phone) }
                                        ]
                                    }
                                ]
                            };
                        });

                        // Send Message OUTSIDE transaction
                        if (messagePayload) {
                            await sendWhatsAppMessage(messagePayload.to, messagePayload.template, messagePayload.components);
                        }
                    }

                    // CASE 2: Address Correct (Step 2)
                    else if (payload === 'ADDRESS_CORRECT' || payload === 'Confirm Address' || body === 'Confirm Address' || body === 'Yes, Correct' || body === 'Correct') {
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
                                template: 'cod_confirmed',
                                components: [
                                    {
                                        type: 'body',
                                        parameters: [{ type: 'text', text: String(data.orderNumber) }]
                                    }
                                ]
                            };
                        });

                        if (messagePayload) {
                            await sendWhatsAppMessage(messagePayload.to, messagePayload.template, messagePayload.components);
                        }
                    }

                    // CASE 3: Make Changes (Step 2)
                    else if (payload === 'ADDRESS_EDIT' || payload === 'Make Changes' || body === 'Make Changes' || body === 'Edit Address') {
                        const orderDoc = await findLatestOrder();
                        if (orderDoc) {
                            await ordersRef.doc(orderDoc.id).update({
                                verificationStatus: 'address_change_requested',
                                updatedAt: admin.firestore.Timestamp.now()
                            });
                            await sendWhatsAppMessage(senderPhone, 'update_address', [
                                { type: 'body', parameters: [{ type: 'text', text: orderDoc.data().customerName || 'Customer' }] }
                            ]);
                        }
                    }

                    // CASE 4: Cancel Order
                    else if (payload === 'CONFIRM_COD_NO' || payload === 'Cancel' || body === 'Cancel' || payload === 'cancel' || body === 'cancel') {
                        const orderDoc = await findLatestOrder();
                        if (orderDoc) {
                            await ordersRef.doc(orderDoc.id).update({
                                status: 'CANCELLED',
                                verificationStatus: 'cancelled',
                                updatedAt: admin.firestore.Timestamp.now()
                            });
                            await sendWhatsAppMessage(senderPhone, 'cod_cancel', [
                                {
                                    type: 'body', parameters: [
                                        { type: 'text', text: orderDoc.data().customerName || 'Customer' },
                                        { type: 'text', text: String(orderDoc.data().orderNumber) }
                                    ]
                                }
                            ]);
                        }
                    }
                }

                return res.status(200).send('EVENT_RECEIVED');
            }

            if (value?.statuses?.[0]) return res.status(200).send('STATUS_RECEIVED');

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
                    rawJson: JSON.stringify(data) // Keep raw data for debugging if needed
                }, { merge: true });

                // Abandoned Cart Recovery
                if (eventType === 'ABANDONED' && phoneNormalized && data.total_price > 0) {
                    const checkoutUrl = data.cart_attributes?.landing_page_url || `https://yourstore.com/cart`;
                    await sendWhatsAppMessage(`91${phoneNormalized}`, 'cart_recovery', [
                        {
                            type: 'body',
                            parameters: [
                                { type: 'text', text: data.first_name || 'Shopper' },
                                { type: 'text', text: String(data.total_price) },
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
                const phoneNormalized = normalizePhone(data.phone || data.customer?.phone || data.shipping_address?.phone);

                // 1. Save Order (Idempotent Set)
                const orderData = {
                    orderId: data.id,
                    orderNumber: data.order_number,
                    totalPrice: data.total_price,
                    currency: data.currency || 'INR',
                    customerName: data.customer ? `${data.customer.first_name} ${data.customer.last_name}` : "Guest",
                    email: data.email || null,
                    phone: data.phone || data.customer?.phone || null,
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

                // 2. Cleanup Carts (Batch Delete)
                if (phoneNormalized || data.email) {
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
                }

                // 3. Send COD Confirmation (Transaction for Duplicate Protection)
                if (orderData.status === 'COD' && phoneNormalized) {
                    let messagePayload = null;

                    await db.runTransaction(async (t) => {
                        const freshDoc = await t.get(orderRef);
                        if (freshDoc.exists && freshDoc.data().whatsappSent) {
                            console.log(`Duplicate Order Webhook for ${orderData.orderNumber}. Skipping WhatsApp.`);
                            return;
                        }

                        t.update(orderRef, { whatsappSent: true });

                        const itemName = orderData.items[0]?.name || 'Your Order';
                        messagePayload = {
                            to: `91${phoneNormalized}`,
                            template: 'cod_auto_confirmation',
                            components: [
                                {
                                    type: 'body',
                                    parameters: [
                                        { type: 'text', text: orderData.customerName },
                                        { type: 'text', text: String(orderData.orderNumber) },
                                        { type: 'text', text: itemName },
                                        { type: 'text', text: String(orderData.totalPrice) }
                                    ]
                                }
                            ]
                        };
                    });

                    if (messagePayload) {
                        await sendWhatsAppMessage(messagePayload.to, messagePayload.template, messagePayload.components);
                    }
                }

                // 4. Send Push Notification
                await sendFCMNotifications(
                    'New Order Received! 💰',
                    `Order #${data.order_number} from ${orderData.customerName} - ₹${data.total_price}`,
                    { orderId, type: 'new_order' }
                );

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
