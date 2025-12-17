# GA4 Integration - Quick Checklist

## ✅ What I've Done For You

- [x] Created `/api/ga4-visitors.js` - Vercel serverless function to fetch GA4 data
- [x] Created `/src/services/ga4Service.js` - Service to call the API with caching
- [x] Updated `StatsScreen.js` to use GA4 active visitors
- [x] Made metrics horizontally scrollable (swipe left/right)
- [x] Added 4th metric card: "Active Visitors"
- [x] Set up automatic 30-second refresh

## 🎯 What You Need To Do

### 1. Find Your GA4 Property ID
- Go to: https://analytics.google.com
- Admin → Property Settings
- Copy the **Property ID** (it's a number)

### 2. Add to Vercel Environment Variables
Go to Vercel → Your Project → Settings → Environment Variables

Add these 7 variables:

| Variable | Value |
|----------|-------|
| `GA4_PROPERTY_ID` | **YOUR_PROPERTY_ID_NUMBER** (from step 1) |
| `GA4_MEASUREMENT_ID` | `G-X10M5QTQBE` |
| `GA4_PROJECT_ID` | `easeyspace` |
| `GA4_PRIVATE_KEY_ID` | `8f6e848d12e9a335293964d3427178c361e400b0` |
| `GA4_PRIVATE_KEY` | The entire private key including BEGIN/END lines |
| `GA4_CLIENT_EMAIL` | `easeyspace@easeyspace.iam.gserviceaccount.com` |
| `GA4_CLIENT_ID` | `105431562582218573432` |
| `GA4_CLIENT_CERT_URL` | `https://www.googleapis.com/robot/v1/metadata/x509/easeyspace%40easeyspace.iam.gserviceaccount.com` |

### 3. Grant Access in GA4
- Go to: https://analytics.google.com
- Admin → Property Access Management
- Add: `easeyspace@easeyspace.iam.gserviceaccount.com`
- Role: **Viewer**

### 4. Update Your Vercel URL
Edit this file: `/src/services/ga4Service.js`

Find line 8 and add your Vercel URL:
```javascript
const API_BASE_URL = __DEV__ 
    ? 'http://localhost:3000' 
    : 'https://YOUR-APP.vercel.app'; // ← UPDATE THIS
```

### 5. Deploy
```bash
git add .
git commit -m "GA4 integration with horizontal scrollable metrics"
git push
```

## 🎉 That's It!

The dashboard will now show:
1. 💰 Total Revenue (swipe →)
2. 🛒 Active Carts (swipe →)
3. 🚫 Abandoned Carts (swipe →)
4. 👥 Active Visitors (from GA4!)

Updates every 30 seconds automatically.

---

**Need full details?** Check `GA4_SETUP.md`
