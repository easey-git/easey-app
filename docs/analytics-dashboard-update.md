# Analytics Dashboard Update

## Changes Made

### 1. Added Active Visitors Metric
- New metric card showing the count of unique active visitors
- Calculated based on unique users currently browsing (checkout activity within the last 5 minutes)
- Uses customer ID, phone, email, or checkout ID to identify unique visitors
- Color: Amber (#f59e0b) with "account-outline" icon

### 2. Horizontal Scrollable Cards (Shopify-style)
- Converted the metrics row to a horizontal `ScrollView`
- All 4 metric cards are now swipeable left/right on mobile
- Each card has a fixed width (~42% of screen width, minimum 160px)
- Hidden scroll indicators for cleaner UI
- Proper spacing between cards (12px gap)

### 3. Current Metrics Display Order
1. **Total Revenue** - Shows total sales (from orders collection)
2. **Active Carts** - Carts currently in progress
3. **Abandoned Carts** - Carts that were abandoned or timed out
4. **Active Visitors** - NEW - Unique users currently browsing

## How It Works

### Active Visitors Calculation
```javascript
// Tracks unique visitors within last 5 minutes who haven't placed an order
const activeVisitorIds = new Set();
if (diffMinutes <= 5 && !isOrdered) {
    const visitorId = data.customerId || data.phone || data.email || doc.id;
    activeVisitorIds.add(visitorId);
}
setActiveVisitors(activeVisitorIds.size);
```

### Horizontal Scroll Implementation
```javascript
<ScrollView 
    horizontal 
    showsHorizontalScrollIndicator={false}
    contentContainerStyle={styles.metricsScrollContent}
    style={styles.metricsScroll}
>
    {/* 4 metric cards */}
</ScrollView>
```

## GA4 Integration (To Be Implemented)

When you're ready to connect Google Analytics 4, here's the recommended approach:

### Option 1: Real-time GA4 API
Use the Google Analytics Data API v1 (Real-time reports) to fetch active users:

```javascript
// Install the dependency
npm install @google-analytics/data

// In your code
import { BetaAnalyticsDataClient } from '@google-analytics/data';

const analyticsDataClient = new BetaAnalyticsDataClient({
  credentials: {
    // Your service account credentials
  }
});

async function getActiveVisitors() {
  const [response] = await analyticsDataClient.runRealtimeReport({
    property: `properties/${YOUR_GA4_PROPERTY_ID}`,
    metrics: [
      {
        name: 'activeUsers',
      },
    ],
  });
  
  return response.rows?.[0]?.metricValues?.[0]?.value || 0;
}
```

### Option 2: Firebase Analytics (if using Firebase)
If you're already using Firebase, you can leverage Firebase Analytics which integrates with GA4:

```javascript
import analytics from '@react-native-firebase/analytics';

// Track custom events
await analytics().logEvent('checkout_started', {
  currency: 'INR',
  value: totalPrice,
});

// Track screen views
await analytics().logScreenView({
  screen_name: 'StatsScreen',
  screen_class: 'StatsScreen',
});
```

### Option 3: GA4 Measurement Protocol
For server-side tracking or custom implementations:

```javascript
fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${MEASUREMENT_ID}&api_secret=${API_SECRET}`, {
  method: 'POST',
  body: JSON.stringify({
    client_id: 'unique_client_id',
    events: [{
      name: 'checkout_progress',
      params: {
        currency: 'INR',
        value: totalPrice,
      }
    }]
  })
});
```

## Next Steps

1. **Create GA4 Property** (if not already done)
   - Go to Google Analytics
   - Create a new GA4 property for your e-commerce site
   - Get the Measurement ID and Property ID

2. **Set Up Service Account** (for API access)
   - Go to Google Cloud Console
   - Create a service account
   - Enable Google Analytics Data API
   - Download credentials JSON

3. **Implement GA4 Tracking**
   - Choose one of the options above
   - Add GA4 tracking to your checkout flow
   - Update the `activeVisitors` state to pull from GA4

4. **Test the Integration**
   - Verify data is flowing to GA4
   - Check real-time reports in GA4 dashboard
   - Compare with your current Firebase-based metrics

## Notes

- Current implementation uses Firebase Firestore data for active visitors
- When GA4 is connected, you can replace the calculation with GA4's real-time active users
- The UI is already set up and ready for GA4 data
- Consider caching GA4 data to avoid excessive API calls (refresh every 30-60 seconds)
