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

                // 1. Determine Event Type & Stage
                let eventType = "ACTIVE_CART";
                let stage = data.latest_stage || "BROWSING";

                if (queryParams.abandoned === "1") {
                    eventType = "ABANDONED";
                }

                // Map technical stages to human readable text
                const stageMap = {
                    "PHONE_RECEIVED": "Entered Phone",
                    "EMAIL_RECEIVED": "Entered Email",
                    "ADDRESS_RECEIVED": "Entered Address",
                    "PAYMENT_INITIATED": "Payment Started"
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

                if (!customerName && phone) {
                    // Mask phone: 7488377378 -> 74883...378
                    customerName = `Visitor (${phone.slice(0, 5)}...)`;
                } else if (!customerName) {
                    customerName = "Visitor";
                }

                const email = data.email || "";

                // Items Logic
                let items = [];
                if (Array.isArray(data.items) && data.items.length > 0) {
                    items = data.items.map(i => ({
                        name: i.name || i.title || "Unknown Item",
                        quantity: i.quantity || 1,
                        price: i.price || 0,
                        image: i.image || null
                    }));
                } else if (data.item_count > 0) {
                    // Placeholder if items details are missing but count exists
                    items = [{
                        name: `${data.item_count} Item(s)`,
                        quantity: data.item_count,
                        price: amount
                    }];
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

                const checkoutData = {
                    eventType,
                    stage: readableStage,
                    checkoutId,
                    shopifyCartToken, // Save token to link with Order later
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
                    source, // Marketing Source
                    ip: attributes.ipv4_address || null,
                    updatedAt: admin.firestore.Timestamp.now(),
                    rawJson: JSON.stringify(data)
                };

                await db.collection("checkouts").doc(docId).set(checkoutData, { merge: true });

                console.log(`Shiprocket Event: ${eventType} (${readableStage}) for ${customerName}`);
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
                    status: "Paid", // Assuming order creation means paid/confirmed
                    items: data.line_items.map(item => ({
                        name: item.title,
                        quantity: item.quantity,
                        price: item.price
                    }))
                };

                // 1. Save Order
                await db.collection("orders").doc(String(data.id)).set(orderData);

                // 2. CLEANUP: Find and Delete the Active Cart (converted)
                // We match Shopify's 'checkout_token' with our saved 'shopifyCartToken'
                if (data.checkout_token) {
                    const cartSnapshot = await db.collection("checkouts")
                        .where("shopifyCartToken", "==", data.checkout_token)
                        .get();

                    if (!cartSnapshot.empty) {
                        const batch = db.batch();
                        cartSnapshot.docs.forEach(doc => {
                            batch.delete(doc.ref);
                        });
                        await batch.commit();
                        console.log(`Converted Cart Deleted: ${data.checkout_token}`);
                    }
                }

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
