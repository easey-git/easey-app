# GA4 Integration Setup Guide

## ✅ What's Been Done

1. **Created API endpoint** at `/api/ga4-visitors.js` that fetches real-time active users from GA4
2. **Created service** at `/src/services/ga4Service.js` to call the API with caching
3. **Updated StatsScreen** to use GA4 data instead of Firebase calculation
4. **Made it horizontally scrollable** with 4 metrics (Shopify-style)

## 🚀 Setup Steps

### Step 1: Get Your GA4 Property ID

You have the Measurement ID: `G-X10M5QTQBE`

But we need the **Property ID** (it's a number). Here's how to find it:

1. Go to [https://analytics.google.com](https://analytics.google.com)
2. Click **Admin** (gear icon at bottom left)
3. Under **Property** column, click **Property Settings**
4. Look for **Property ID** - it's a number like `123456789`

### Step 2: Add Environment Variables to Vercel

Go to your Vercel project → **Settings** → **Environment Variables** and add these:

```bash
# GA4 Property ID (FIND THIS IN STEP 1)
GA4_PROPERTY_ID=YOUR_PROPERTY_ID_NUMBER_HERE

# Measurement ID
GA4_MEASUREMENT_ID=G-X10M5QTQBE

# Service Account Credentials
GA4_PROJECT_ID=easeyspace
GA4_PRIVATE_KEY_ID=8f6e848d12e9a335293964d3427178c361e400b0

# For GA4_PRIVATE_KEY, copy the ENTIRE private key including the BEGIN/END lines:
GA4_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQC956y1ZUVyvsiB
F7vMVuNwfVNIP7hPUjAHpGNXR4wQhTPJIPkebvA766DMEm4aEqCwsn/IV2AiouGp
oo8WVDFYDFBuNx81ovPBYpmDX/+vv71awP+qZCfK/A6hlTubYS6p7v5q+L9DF3Z2
3Ro8V0j3uSAcxGc6k1AydBk/OyXMaMxL2PqhJ2zJaNORXsWVgjlQmFAVJEupsJwL
WytPm5K7jVMrk/vaFzCSeNyMJDr+HKsuHgi9+I+irff/GjdRI0nbnlf66gr/9x2c
hO2/7kitW6kOZPxe8vP61k1Aezduz910XB7cnVW9KFBeov8R5lNDz3ZL8mCVLle1
L5RhJ9+lAgMBAAECggEAWKZpU8aCPHX+QHEVXGblRnJiqdQBFJo/zJl7PFesdVvR
GF95m7DbGYW96vXhiu9OLx4sk5fiS1jw8hDuLdTAsiMRetnlilLW6lw+YHs0b1UZ
Ll/xGZgmkVXH+Lsi975Om8py3vnewxGVXhiJ8kgmymmTqYovzELPibXzwTY5x2kI
rA91VRu7E+fK7b8GDbp8c0RH8o/wkDFYnsnRZLZnQMuDiJov7ZYuQB+aXpe2UypI
w+ueuHIYXbZNL2ByircNTjrhP3bPNKGH/7VtUSOWlugH5pCktcHVmjgeitHZp/5M
m8u7JOdunISyOwV0HbWMDwna2qDB6biKq8F/7YrZ0wKBgQDgzlMxPn6zjx93aSD9
pyVxCeq/+iqR+ESFw9Fx/L7jowrN1CuUWbgTeEJzAoVTuvmCM2XAob4HR4yyUNIS
eMsDcJeEccfk4sQe7clByGtGO6uLXtZsgXz4SQXcVn2FC1alJgMor6qLLuC92xRF
Jyf7qzv5e+z4rF/jLx7vUGZPDwKBgQDYQZQvMQmc1ao7KaSxpUPoVt81DGMe7f5D
+Y4MbZpfqsFzx9kheBhKQbJ7RpGlMgUmSqZiz7PayNWg01EJDvkhAevmIVWsEO8p
B6mTgMgvJRaTtV4xn6kByB3g6+3V/IiIOu5vm5p6ObQot9Vw+CoCH1taZnKtJQnH
jxi8IpXmCwKBgGf4RJWT17lnyh/J6U4mzbQ35/Ad3S5hah+LbwSO5iIVt9t18ynL
TM0EY4cZdVxCLz8+UiMDKwXm23Vk16NfZlUS76B7lv2OuzGqu9fGv4Zd9nqgw/6u
7INQEnvTLH4pvkrnB7L7e56fcaWc+wT4lQ9aJITAAdsIrdg+ZMo9nvOVAoGAHUnk
c+/ESYV2pMSjFZw4ckMxv9GJqyq4gSRPZMeDXOmXgcLTWYEWaRg0wBVyrFj18ZWy
qzdOOJdyt3FnTD7G5v2HoYdqPv+cJIZxJRUQB7KSODccJsRk82TTBx9s+spVA35X
xK3iYiNmjw02zzINHnR4vumZJnIZvPlYdEKK4rkCgYA5gPNnGSGOk/FTQU4Hh5zS
uSY6oBhHDVJpG2F734oaPixyJ7cICQNdY5UEYREQMrr7Vf42QEtr+kkHacTIR2IL
LVVOvWHSResUOIPguFHbCIoL6yEPsuBtUOYdYMH8tIg0R2CqqxX1KVqxx8EqZla8
h3SH5oB3BKBKhTh3HMOigg==
-----END PRIVATE KEY-----

GA4_CLIENT_EMAIL=easeyspace@easeyspace.iam.gserviceaccount.com
GA4_CLIENT_ID=105431562582218573432
GA4_CLIENT_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/easeyspace%40easeyspace.iam.gserviceaccount.com
```

**Important for Private Key:**
- In Vercel, paste it as one continuous line with `\n` for line breaks
- OR paste it exactly as shown above (Vercel will handle it)

### Step 3: Grant GA4 Access to Service Account

1. Go to [https://analytics.google.com](https://analytics.google.com)
2. Click **Admin** → **Property** → **Property Access Management**
3. Click **+** (Add users)
4. Enter email: `easeyspace@easeyspace.iam.gserviceaccount.com`
5. Select role: **Viewer** (sufficient for reading data)
6. Click **Add**

### Step 4: Update Vercel URL in Code

Edit `/src/services/ga4Service.js` line 8:

```javascript
const API_BASE_URL = __DEV__ 
    ? 'http://localhost:3000' 
    : 'https://easey-app.vercel.app'; // Replace with YOUR actual Vercel URL
```

### Step 5: Deploy

```bash
# Commit changes
git add .
git commit -m "Added GA4 active visitors integration"
git push

# Or deploy manually
vercel --prod
```

### Step 6: Test

Once deployed:
1. Open your app
2. Go to Dashboard/Analytics screen
3. Swipe the metrics cards left/right
4. The "Active Visitors" card should show real-time GA4 data
5. It updates every 30 seconds

## 🔧 Troubleshooting

### Error: "GA4_PROPERTY_ID not configured"
- Make sure you added all environment variables in Vercel
- Redeploy after adding environment variables

### Error: "Permission denied"
- Add the service account email to GA4 (Step 3)
- Wait a few minutes for permissions to propagate

### Shows 0 visitors
- Check if GA4 is tracking your website properly
- Visit your site in another tab to generate traffic
- Check GA4 real-time reports to verify data is flowing

### API not working locally
- If testing locally, you need a `.env.local` file with all the GA4 variables
- Or temporarily hardcode values in development

## 📊 What You Get

**Before:** Active Visitors calculated from Firebase checkouts (last 5 min activity)

**After:** Active Visitors from Google Analytics 4 real-time data
- More accurate
- Includes all visitors (not just checkouts)
- Industry standard metrics
- 30-second refresh rate
- Cached to prevent excessive API calls

## 🎨 UI Features

✅ Horizontal scrollable cards (swipe left/right)
✅ 4 metrics: Revenue, Active Carts, Abandoned, Active Visitors
✅ Real-time GA4 integration
✅ Automatic refresh every 30 seconds
✅ Graceful error handling (shows 0 on error)
✅ Caching to reduce API calls

---

**Need help?** Check browser console for errors or Vercel function logs.
