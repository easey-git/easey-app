const admin = require("firebase-admin");
const cors = require('cors')({ origin: true });

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

// --- CONSTANTS ---
const CONSTANTS = {
    TEMPLATES: {
        COD_CONFIRMATION: 'cod_auto_confirmation',
        ORDER_CONFIRM_SCHEDULE: 'order_confirm_auto_schedule',
        COD_CONFIRMED: 'cod_confirmed',
        UPDATE_ADDRESS: 'update_address',
        COD_CANCEL: 'cod_cancel',
        CART_RECOVERY: 'cart_recovery',
        NDR_CONFIRMED: 'ndr_action_confirmed'
    },
    PAYLOADS: {
        CONFIRM_YES: ['CONFIRM_COD_YES', 'Confirm Order'],
        CONFIRM_NO: ['CONFIRM_COD_NO', 'Cancel', 'cancel'],
        ADDRESS_CORRECT: ['ADDRESS_CORRECT', 'Confirm Address', 'Yes, Correct', 'Correct'],
        ADDRESS_EDIT: ['ADDRESS_EDIT', 'Make Changes', 'Edit Address', 'Update Address'],
        NDR_REATTEMPT: ['REATTEMPT_DELIVERY', 'Re-attempt Delivery'],
        NDR_CANCEL: ['CANCEL_SHIPMENT', 'Cancel Shipment'],
    }
};

// --- HELPERS ---
const normalizePhone = (phone) => {
    if (!phone) return null;
    let p = phone.toString().replace(/\D/g, '');
    if (p.length === 10) p = `91${p}`;
    return p;
};

const sendWhatsAppMessage = async (to, templateName, components, languageCode = "en_US") => {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneId || !to) {
        console.error('[WhatsApp] Missing credentials or recipient');
        return;
    }

    try {
        const response = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messaging_product: "whatsapp",
                to: to,
                type: "template",
                template: {
                    name: templateName,
                    language: { code: languageCode },
                    components: components
                }
            })
        });
        
        const responseData = await response.json();
        
        if (!response.ok) {
            console.error(`[WhatsApp API Error] Template: ${templateName}, Status: ${response.status}`, JSON.stringify(responseData));
            return;
        }

        // Log to Firestore for visibility
        await db.collection('whatsapp_messages').add({
            phone: to,
            phoneNormalized: normalizePhone(to),
            direction: 'outbound',
            type: 'template',
            templateName: templateName,
            whatsappId: responseData.messages?.[0]?.id || null,
            timestamp: admin.firestore.Timestamp.now(),
            expireAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))
        });
        
        console.log(`[WhatsApp] Successfully sent ${templateName} to ${to}`);
    } catch (e) { 
        console.error('[WhatsApp Exception]', e); 
    }
};

const sendFCMNotifications = async (title, body, dataPayload) => {
    try {
        const tokensSnapshot = await db.collection('push_tokens').where('role', '==', 'admin').get();
        if (tokensSnapshot.empty) return;
        const tokens = tokensSnapshot.docs.map(doc => doc.data().token);
        const messages = [...new Set(tokens)].map(token => ({
            token: token,
            notification: { title, body },
            data: dataPayload || {}
        }));
        await admin.messaging().sendEach(messages);
    } catch (error) { console.error(error); }
};

// --- HANDLER ---
module.exports = async (req, res) => {
    await runMiddleware(req, res, cors);

    if (req.method === 'GET') {
        if (req.query['hub.verify_token'] === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
            return res.status(200).send(req.query['hub.challenge']);
        }
        return res.status(403).send('Forbidden');
    }

    if (req.method !== 'POST') return res.status(200).send('OK');

    try {
        const data = req.body;
        const queryParams = req.query || {};

        // ---------------------------------------------------------
        // A. SHIPROCKET CHECKOUT / ABANDONED CART
        // ---------------------------------------------------------
        if (data.cart_id || data.latest_stage) {
            let eventType = data.latest_stage || "UNKNOWN";
            if (queryParams.abandoned === "1") eventType = "ABANDONED";

            const checkoutId = data.cart_id || "";
            const customerName = `${data.first_name || ''} ${data.last_name || ''}`.trim() || 'Visitor';

            const checkoutData = {
                eventType,
                checkoutId,
                orderId: data.order_id || "",
                amount: data.total_price || 0,
                currency: data.currency || "INR",
                customerName,
                email: data.email || "",
                phone: data.phone_number || "",
                items: (data.items || []).map(i => ({ name: i.name || i.title || "", quantity: i.quantity || 1, price: i.price || 0 })),
                city: data.shipping_address?.city || "",
                state: data.shipping_address?.state || "",
                pincode: data.shipping_address?.zip || "",
                updatedAt: admin.firestore.Timestamp.now(),
                rawJson: JSON.stringify(data)
            };

            await db.collection("checkouts").doc(checkoutId ? `checkout_${checkoutId}` : `unknown_${Date.now()}`).set(checkoutData, { merge: true });
            return res.status(200).send("OK");
        }

        // ---------------------------------------------------------
        // B. SHOPIFY ORDER CREATION
        // ---------------------------------------------------------
        if (data.order_number) {
            const address = data.shipping_address || data.billing_address || {};
            const orderData = {
                orderId: data.id,
                orderNumber: data.order_number,
                totalPrice: Number(data.total_price || 0),
                currency: data.currency || 'INR',
                customerName: data.customer ? `${data.customer.first_name} ${data.customer.last_name}`.trim() : "Guest",
                email: data.email || null,
                phone: data.phone || address.phone || (data.customer ? data.customer.phone : null),
                phoneNormalized: normalizePhone(data.phone || address.phone || (data.customer ? data.customer.phone : null)),
                
                // Address Info
                address1: address.address1 || '',
                city: address.city || '',
                state: address.province || '',
                zip: address.zip || '',

                // System Statuses
                status: "COD",
                cod_status: "pending",
                verificationStatus: 'pending',
                whatsappSent: false,
                
                createdAt: admin.firestore.Timestamp.now(),
                updatedAt: admin.firestore.Timestamp.now(),
                items: (data.line_items || []).map(item => ({ 
                    name: item.title, 
                    quantity: item.quantity, 
                    price: Number(item.price || 0)
                }))
            };

            await db.collection("orders").doc(String(data.id)).set(orderData, { merge: true });

            // --- AUTO-TRIGGER WHATSAPP ---
            if (orderData.phoneNormalized) {
                const firstItem = orderData.items?.[0]?.name || 'your order';
                const productDisplay = (orderData.items?.length > 1) ? `${firstItem} & more` : firstItem;

                const components = [
                    {
                        type: 'body',
                        parameters: [
                            { type: 'text', text: orderData.customerName || 'Customer' },
                            { type: 'text', text: String(orderData.orderNumber) },
                            { type: 'text', text: productDisplay },
                            { type: 'text', text: String(orderData.totalPrice) }
                        ]
                    }
                ];

                await sendWhatsAppMessage(orderData.phoneNormalized, CONSTANTS.TEMPLATES.COD_CONFIRMATION, components, "en_US");
                
                // Update flag to prevent double-send
                await db.collection("orders").doc(String(data.id)).update({ 
                    whatsappSent: true,
                    whatsappSentAt: admin.firestore.Timestamp.now()
                });
            }

            console.log(`Shopify Order ${data.order_number} saved and WhatsApp triggered.`);
            return res.status(200).json({ success: true });
        }

        // ---------------------------------------------------------
        // C. WHATSAPP WEBHOOK (EXISTING)
        // ---------------------------------------------------------
        const entry = req.body.entry?.[0];
        const changes = entry?.changes?.[0];
        const value = changes?.value;

        if (value?.messages?.[0]) {
            const message = value.messages[0];
            const senderPhone = message.from;
            const phoneNormalized = normalizePhone(senderPhone);
            const msgId = message.id;
            
            // Idempotency
            const msgLogRef = db.collection('processed_webhooks').doc(msgId);
            if ((await msgLogRef.get()).exists) return res.status(200).send('OK');
            await msgLogRef.set({ processedAt: admin.firestore.Timestamp.now() });

            let body = '';
            let payload = '';
            if (message.type === 'text') body = message.text.body;
            else if (message.type === 'button') { body = message.button.text; payload = message.button.payload; }
            else if (message.type === 'interactive' && message.interactive.button_reply) {
                body = message.interactive.button_reply.title;
                payload = message.interactive.button_reply.id;
            }

            // Log Inbound
            await db.collection('whatsapp_messages').doc(msgId).set({
                phone: senderPhone,
                phoneNormalized,
                direction: 'inbound',
                body,
                payload,
                timestamp: admin.firestore.Timestamp.now(),
                expireAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))
            });

            // Find Latest Order
            const ordersSnap = await db.collection('orders').where('phoneNormalized', '==', phoneNormalized).get();
            if (ordersSnap.empty) return res.status(200).send('OK');
            const orderDoc = ordersSnap.docs.sort((a,b) => (b.data().createdAt?.seconds || 0) - (a.data().createdAt?.seconds || 0))[0];
            const orderData = orderDoc.data();

            // --- PAYLOAD CHECKS ---
            const isConfirmYes = CONSTANTS.PAYLOADS.CONFIRM_YES.includes(payload) || CONSTANTS.PAYLOADS.CONFIRM_YES.includes(body);
            const isAddressCorrect = CONSTANTS.PAYLOADS.ADDRESS_CORRECT.includes(payload) || CONSTANTS.PAYLOADS.ADDRESS_CORRECT.includes(body);
            const isAddressEdit = CONSTANTS.PAYLOADS.ADDRESS_EDIT.includes(payload) || CONSTANTS.PAYLOADS.ADDRESS_EDIT.includes(body);
            const isCancel = CONSTANTS.PAYLOADS.CONFIRM_NO.includes(payload) || CONSTANTS.PAYLOADS.CONFIRM_NO.includes(body.toLowerCase()) || CONSTANTS.PAYLOADS.NDR_CANCEL.includes(payload) || CONSTANTS.PAYLOADS.NDR_CANCEL.includes(body);
            const isNdrReattempt = CONSTANTS.PAYLOADS.NDR_REATTEMPT.includes(payload) || CONSTANTS.PAYLOADS.NDR_REATTEMPT.includes(body);

            // 1. Confirm Order (Step 1)
            if (isConfirmYes) {
                if (orderData.verificationStatus === 'cancelled') return res.status(200).send('OK');
                await orderDoc.ref.update({ verificationStatus: 'approved', cod_status: 'confirmed', updatedAt: admin.firestore.Timestamp.now() });
                const addr = `${orderData.address1}, ${orderData.city}, ${orderData.state || ''}`;
                await sendWhatsAppMessage(senderPhone, CONSTANTS.TEMPLATES.ORDER_CONFIRM_SCHEDULE, [
                    { type: 'body', parameters: [
                        { type: 'text', text: String(orderData.orderNumber) },
                        { type: 'text', text: addr },
                        { type: 'text', text: String(orderData.zip) },
                        { type: 'text', text: String(orderData.phone) }
                    ]}
                ], "en_US");
            }

            // 2. Address Correct
            else if (isAddressCorrect) {
                await orderDoc.ref.update({ verificationStatus: 'approved', cod_status: 'confirmed', updatedAt: admin.firestore.Timestamp.now() });
                await sendWhatsAppMessage(senderPhone, CONSTANTS.TEMPLATES.COD_CONFIRMED, [
                    { type: 'body', parameters: [{ type: 'text', text: String(orderData.orderNumber) }] }
                ], "en_US");
            }

            // 3. NDR Action or Address Edit
            else if (isNdrReattempt || isAddressEdit) {
                const actionLabel = isNdrReattempt ? 'Re-attempted' : 'Updated';
                const actionType = isNdrReattempt ? 'Re-attempt Delivery' : 'Address Update';
                
                await orderDoc.ref.update({
                    isNdrAlert: true,
                    ndr_alert_type: isNdrReattempt ? 'REATTEMPT' : 'ADDRESS_UPDATE',
                    ndr_status: isNdrReattempt ? 'reattempt_requested' : 'address_update_requested',
                    ndr_customer_note: `Customer requested: ${actionType}`,
                    updatedAt: admin.firestore.Timestamp.now()
                });

                await sendFCMNotifications(`NDR Alert: ${actionType} 🚨`, `Order #${orderData.orderNumber} needs attention.`, { orderId: orderDoc.id });
                
                if (isAddressEdit) {
                    // Send specialized Update Address template (1 param: Name)
                    await sendWhatsAppMessage(senderPhone, CONSTANTS.TEMPLATES.UPDATE_ADDRESS, [
                        { type: 'body', parameters: [{ type: 'text', text: orderData.customerName || 'Customer' }] }
                    ]);
                    await orderDoc.ref.update({ whatsapp_flow: 'AWAITING_ADDRESS' });
                } else {
                    // Send generic NDR confirmation
                    await sendWhatsAppMessage(senderPhone, CONSTANTS.TEMPLATES.NDR_CONFIRMED, [
                        { type: 'body', parameters: [{ type: 'text', text: actionLabel }] }
                    ]);
                }
            }

            // 4. Cancel
            else if (isCancel) {
                await orderDoc.ref.update({ 
                    status: 'CANCELLED', 
                    verificationStatus: 'cancelled', 
                    isNdrAlert: true, // Also show in the new Alerts tab
                    ndr_alert_type: 'CANCEL',
                    updatedAt: admin.firestore.Timestamp.now() 
                });

                await sendFCMNotifications('Order Cancelled ❌', `Order #${orderData.orderNumber} was cancelled.`, { orderId: orderDoc.id });
                
                await sendWhatsAppMessage(senderPhone, CONSTANTS.TEMPLATES.COD_CANCEL, [
                    { type: 'body', parameters: [
                        { type: 'text', text: orderData.customerName || 'Customer' },
                        { type: 'text', text: String(orderData.orderNumber) }
                    ]}
                ], "en_US");
            }

            // 5. Text Address Update (Capturing the typed address)
            else if (message.type === 'text' && orderData.whatsapp_flow === 'AWAITING_ADDRESS') {
                await orderDoc.ref.update({ 
                    updatedAddress: body, 
                    whatsapp_flow: admin.firestore.FieldValue.delete(), 
                    verificationStatus: 'address_updated',
                    isNdrAlert: true,
                    ndr_alert_type: 'ADDRESS_UPDATE', // Keep it in the alerts hub
                    updatedAt: admin.firestore.Timestamp.now()
                });

                await sendFCMNotifications('Address Updated! 📍', `New address for #${orderData.orderNumber}: ${body}`, { orderId: orderDoc.id });
                
                // Shoot the "Acknowledged" version of the template (en_US)
                await sendWhatsAppMessage(senderPhone, CONSTANTS.TEMPLATES.UPDATE_ADDRESS, [
                    { type: 'body', parameters: [{ type: 'text', text: orderData.customerName || 'Customer' }] }
                ], "en_US");
            }
        }

        return res.status(200).send('OK');
    } catch (e) {
        console.error(e);
        return res.status(200).send('OK');
    }
};
