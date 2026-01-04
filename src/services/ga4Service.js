/**
 * GA4 Analytics Service
 * Fetches real-time analytics data from our Vercel API
 */

// Always use production Vercel URL (API runs on Vercel, not locally)
const API_BASE_URL = 'https://easey-app.vercel.app';

/**
 * Fetch active visitors from GA4 with detailed breakdown
 * @returns {Promise<Object>} { activeVisitors: number, details: Array }
 */
export const getDetailedVisitors = async () => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/ga4-visitors`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data; // Returns { activeVisitors, details, timestamp }
    } catch (error) {
        console.error('Error fetching GA4 properties:', error);
        return { activeVisitors: 0, details: [] };
    }
};

/**
 * Fetch active visitors count (Legacy wrapper)
 * @returns {Promise<number>} Number of active visitors
 */
export const getActiveVisitors = async () => {
    const data = await getDetailedVisitors();
    return data.activeVisitors || 0;
};

/**
 * Get active visitors with caching to avoid excessive API calls
 * Cache expires after 30 seconds
 */
let cachedData = { activeVisitors: 0, details: [] };
let lastFetchTime = 0;
const CACHE_DURATION = 30000; // 30 seconds

export const getCachedActiveVisitors = async () => {
    const now = Date.now();

    // Return cached value if still fresh
    if (now - lastFetchTime < CACHE_DURATION) {
        return cachedData.activeVisitors;
    }

    // Fetch new data
    cachedData = await getDetailedVisitors();
    lastFetchTime = now;

    return cachedData.activeVisitors;
};

/**
 * Get full cached data (including details)
 */
export const getCachedDetailedVisitors = async () => {
    const now = Date.now();

    if (now - lastFetchTime < CACHE_DURATION) {
        return cachedData;
    }

    cachedData = await getDetailedVisitors();
    lastFetchTime = now;

    return cachedData;
};
