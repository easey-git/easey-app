const admin = require("firebase-admin");

// Initialize Firebase Admin if it hasn't been initialized yet
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    });
}

const db = admin.firestore();

module.exports = async (req, res) => {
    // 1. Handle Shopify Order Creation (POST)
    if (req.method === 'POST') {
        try {
            const data = req.body;
            const queryParams = req.query || {};

            // ---------------------------------------------------------
            // A. SHIPROCKET CHECKOUT / ABANDONED CART
            // ---------------------------------------------------------
            // Detect if it's a Shiprocket event (has cart_id or latest_stage)
            if (data.cart_id || data.latest_stage) {

                // 1. Determine Event Type
                let eventType = data.latest_stage || "UNKNOWN";
                if (queryParams.abandoned === "1") {
                    eventType = "ABANDONED";
                }

                const checkoutId = data.cart_id || "";
                const orderId = data.order_id || "";

                // 2. Extract Data (Matching your Google Script logic)
                const amount = data.total_price || 0;
                const currency = data.currency || "INR";
                const address = data.shipping_address || data.billing_address || {};

                const firstName = data.first_name || address.first_name || "";
                const lastName = data.last_name || address.last_name || "";
                const customerName = `${firstName} ${lastName}`.trim();

                const email = data.email || "";
                const phone = data.phone_number || "";

                let items = [];
                if (Array.isArray(data.items)) {
                    items = data.items.map(i => ({
                        name: i.name || i.title || "",
                        quantity: i.quantity || 1,
                        price: i.price || 0
                    }));
                }

                const city = address.city || "";
                const state = address.state || "";
                const pincode = address.zip || "";

                const paymentMethod = data.payment_method || "";
                const paymentStatus = data.payment_status || "";
                const recoveryUrl = data.recovery_url || "";

                // 3. Duplicate Prevention & Save to Firestore
                // We use checkoutId as the document ID to prevent duplicates automatically.
                // If the eventType changes (e.g., from 'shipping' to 'payment'), we update the doc.

                const docId = checkoutId ? `checkout_${checkoutId}` : `unknown_${Date.now()}`;

                const checkoutData = {
                    eventType,
                    checkoutId,
                    orderId,
                    amount,
                    currency,
                    customerName,
                    email,
                    phone,
                    items,
                    city,
                    state,
                    pincode,
                    paymentMethod,
                    paymentStatus,
                    recoveryUrl,
                    updatedAt: admin.firestore.Timestamp.now(),
                    rawJson: JSON.stringify(data) // Store raw data just in case
                };

                // If it's a new order (completed), we might want to save it to 'orders' too, 
                // but for now let's keep Shiprocket activity in its own collection 
                // or merge it if you prefer.
                // Let's save to a "checkouts" collection for live activity.

                await db.collection("checkouts").doc(docId).set(checkoutData, { merge: true });

                console.log(`Shiprocket Event: ${eventType} for ${customerName}`);
                return res.status(200).send("OK");
            }

            // ---------------------------------------------------------
            // B. SHOPIFY ORDER CREATION (Fallback)
            // ---------------------------------------------------------
            if (data.order_number) {
                const orderData = {
                    orderId: data.id,
                    orderNumber: data.order_number,
                    totalPrice: data.total_price,
                    currency: data.currency,
                    customerName: data.customer ? `${data.customer.first_name} ${data.customer.last_name}` : "Guest",
                    email: data.email,
                    phone: data.phone || (data.customer ? data.customer.phone : null),
                    createdAt: admin.firestore.Timestamp.now(),
                    status: "New",
                    items: data.line_items.map(item => ({
                        name: item.title,
                        quantity: item.quantity,
                        price: item.price
                    }))
                };

                await db.collection("orders").doc(String(data.id)).set(orderData);
                console.log(`Shopify Order ${data.order_number} saved.`);
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
