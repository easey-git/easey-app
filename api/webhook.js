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
                const phoneNormalized = phone ? phone.replace(/\D/g, '').slice(-10) : null;

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
                    phoneNormalized, // For smart matching
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
