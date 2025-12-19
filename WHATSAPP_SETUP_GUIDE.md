# WhatsApp Manager Setup Guide

This guide will help you complete the setup of your "Industry Standard" WhatsApp Manager.

## 1. Fix Firestore Indexes (Critical)
Your app is currently failing to fetch data because it needs "Indexes" to perform complex queries (like sorting orders by date AND filtering by status).

**Action:** Click the following links to create them automatically in your Firebase Console:

1.  **Orders Index:** [Create Index for Orders](https://console.firebase.google.com/v1/r/project/easey-db/firestore/indexes?create_composite=Ckdwcm9qZWN0cy9lYXNleS1kYi9kYXRhYmFzZXMvKGRlZmF1bHQpL2NvbGxlY3Rpb25Hcm91cHMvb3JkZXJzL2luZGV4ZXMvXxABGgoKBnN0YXR1cxABGg0KCWNyZWF0ZWRBdBACGgwKCF9fbmFtZV9fEAI)
2.  **Messages Index:** [Create Index for Messages](https://console.firebase.google.com/v1/r/project/easey-db/firestore/indexes?create_composite=ClJwcm9qZWN0cy9lYXNleS1kYi9kYXRhYmFzZXMvKGRlZmF1bHQpL2NvbGxlY3Rpb25Hcm91cHMvd2hhdHNhcHBfbWVzc2FnZXMvaW5kZXhlcy9fEAEaEwoPcGhvbmVOb3JtYWxpemVkEAEaDQoJdGltZXN0YW1wEAEaDAoIX19uYW1lX18QAQ)

*Wait a few minutes after clicking for the indexes to build.*

---

## 2. Create WhatsApp Templates (Meta Dashboard)
Go to your [WhatsApp Manager](https://business.facebook.com/wa/manage/message-templates/) and create these exact templates.

### Template 1: COD Confirmation
*   **Name:** `cod_confirmation`
*   **Category:** Utility (or Authentication/Transactional)
*   **Language:** English (US)
*   **Body Text:**
    > Hello {{1}}, thank you for placing order #{{2}} worth ₹{{3}}. To ensure a smooth delivery, please confirm your Cash on Delivery order by clicking the button below.
*   **Buttons:** Quick Reply
    *   Button 1: `Confirm Order` (Payload: `CONFIRM_COD_YES`)
    *   Button 2: `Cancel Order` (Payload: `CONFIRM_COD_NO`)

### Template 2: Cart Recovery
*   **Name:** `cart_recovery`
*   **Category:** Marketing
*   **Language:** English (US)
*   **Body Text:**
    > Hi {{1}}, you left items worth ₹{{2}} in your cart. Don't miss out! Complete your purchase now.
*   **Buttons:** Call to Action
    *   Type: Visit Website
    *   Text: Checkout Now
    *   URL: `https://yourstore.com/cart` (or your dynamic URL)

---

## 3. Configure Webhook (Meta Dashboard)
To receive customer replies and auto-verify orders:

1.  Go to **WhatsApp Manager > Configuration**.
2.  **Callback URL:** `https://your-vercel-project.vercel.app/api/webhook`
    *(Replace `your-vercel-project` with your actual Vercel domain)*
3.  **Verify Token:** `easeycrm_whatsapp_verify`
4.  **Webhooks fields:** Click "Manage" and subscribe to `messages`.

---

## 4. Vercel Environment Variables
Ensure these are set in your Vercel Project Settings:

*   `WHATSAPP_ACCESS_TOKEN`: Your permanent or system user access token.
*   `WHATSAPP_PHONE_NUMBER_ID`: Your WhatsApp Phone Number ID (not the phone number itself).
*   `WHATSAPP_WEBHOOK_VERIFY_TOKEN`: `easeycrm_whatsapp_verify`
*   `FIREBASE_SERVICE_ACCOUNT`: Your full Firebase service account JSON.

---

## 5. Troubleshooting "Expo" Errors
You saw errors like `expo-notifications ... removed from Expo Go`.

*   **Explanation:** Push notifications (and some advanced background tasks) **do not work** in the "Expo Go" app you download from the Play Store.
*   **Solution:** You must build a custom "Development Build" to test these features.
    *   Run: `eas build --profile development --platform android`
    *   Install the resulting APK on your phone.
    *   Run: `npx expo start --dev-client`
