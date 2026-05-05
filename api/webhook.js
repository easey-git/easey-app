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

const sendWhatsAppMessage = async (to, templateName, components, languageCode = "en") => {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneId || !to) return;

    try {
        await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
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
        
        // Log log
        db.collection('whatsapp_messages').add({
            phone: to,
            phoneNormalized: normalizePhone(to),
            direction: 'outbound',
            type: 'template',
            templateName: templateName,
            timestamp: admin.firestore.Timestamp.now(),
            expireAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))
        }).catch(() => {});
    } catch (e) { console.error(e); }
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
                    isNdrAlert: true, // Dedicated flag for the new Alerts tab
                    ndr_alert_type: isNdrReattempt ? 'REATTEMPT' : 'ADDRESS_UPDATE',
                    ndr_status: isNdrReattempt ? 'reattempt_requested' : 'address_update_requested',
                    ndr_customer_note: `Customer requested: ${actionType}`,
                    updatedAt: admin.firestore.Timestamp.now()
                });

                await sendFCMNotifications(`NDR Alert: ${actionType} 🚨`, `Order #${orderData.orderNumber} needs attention.`, { orderId: orderDoc.id });
                
                // Confirm to customer (Param 1 = Action)
                await sendWhatsAppMessage(senderPhone, 'ndr_action_confirmed', [
                    { type: 'body', parameters: [{ type: 'text', text: actionLabel }] }
                ]);
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

            // 5. Text Address Update
            else if (message.type === 'text' && orderData.whatsapp_flow === 'AWAITING_ADDRESS') {
                await orderDoc.ref.update({ updatedAddress: body, whatsapp_flow: admin.firestore.FieldValue.delete(), verificationStatus: 'address_updated' });
                await sendFCMNotifications('Address Updated! 📍', `New address for #${orderData.orderNumber}: ${body}`, { orderId: orderDoc.id });
                await sendWhatsAppMessage(senderPhone, 'address_updated_thanks', [
                    { type: 'body', parameters: [
                        { type: 'text', text: orderData.customerName || 'Customer' },
                        { type: 'text', text: String(orderData.orderNumber) }
                    ]}
                ]);
            }
        }

        return res.status(200).send('OK');
    } catch (e) {
        console.error(e);
        return res.status(200).send('OK');
    }
};
