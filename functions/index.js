const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();
const db = admin.firestore();

// TODO: Get this from your Shopify App settings
const SHOPIFY_SECRET = "YOUR_SHOPIFY_WEBHOOK_SECRET";

/**
 * Verify Shopify Webhook HMAC
 */
const verifyShopifyWebhook = (req) => {
    const hmac = req.get("X-Shopify-Hmac-Sha256");
    const body = req.rawBody; // Firebase Functions provides rawBody
    const hash = crypto
        .createHmac("sha256", SHOPIFY_SECRET)
        .update(body, "utf8")
        .digest("base64");
    return hash === hmac;
};

/**
 * Shopify Order Creation Webhook
 * Endpoint: /shopifyOrderCreate
 */
exports.shopifyOrderCreate = functions.https.onRequest(async (req, res) => {
    if (req.method !== "POST") {
        return res.status(405).send("Method Not Allowed");
    }

    // Verify security (Optional but recommended)
    // if (!verifyShopifyWebhook(req)) {
    //   return res.status(401).send("Unauthorized");
    // }

    try {
        const order = req.body;

        // Extract relevant data
        const orderData = {
            orderId: order.id,
            orderNumber: order.order_number,
            totalPrice: order.total_price,
            currency: order.currency,
            customerName: order.customer ? `${order.customer.first_name} ${order.customer.last_name}` : "Guest",
            email: order.email,
            phone: order.phone || (order.customer ? order.customer.phone : null),
            createdAt: admin.firestore.Timestamp.now(),
            status: "New",
            items: order.line_items.map(item => ({
                name: item.title,
                quantity: item.quantity,
                price: item.price
            }))
        };

        // Save to Firestore
        await db.collection("orders").doc(String(order.id)).set(orderData);

        console.log(`Order ${order.order_number} saved successfully.`);
        res.status(200).send("Order processed");
    } catch (error) {
        console.error("Error processing order:", error);
        res.status(500).send("Internal Server Error");
    }
});

/**
 * Shiprocket Abandoned Cart Webhook (Generic Listener)
 * Endpoint: /shiprocketEvent
 */
exports.shiprocketEvent = functions.https.onRequest(async (req, res) => {
    try {
        const event = req.body;

        // Log event for debugging
        console.log("Shiprocket Event:", JSON.stringify(event));

        // Example: If Shiprocket sends abandoned cart data
        if (event.current_status === "ABANDONED") {
            await db.collection("abandoned_checkouts").add({
                ...event,
                receivedAt: admin.firestore.Timestamp.now()
            });
        }

        res.status(200).send("Event received");
    } catch (error) {
        console.error("Error processing Shiprocket event:", error);
        res.status(500).send("Error");
    }
});
