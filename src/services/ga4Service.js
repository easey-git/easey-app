/**
 * GA4 Analytics Service
 * Fetches real-time analytics data from our Vercel API
 */

// Always use production Vercel URL (API runs on Vercel, not locally)
const API_BASE_URL = 'https://easey-app.vercel.app';

/**
 * Fetch active visitors from GA4
 * @returns {Promise<number>} Number of active visitors
 */
export const getActiveVisitors = async () => {
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
        return data.activeVisitors || 0;
    } catch (error) {
        console.error('Error fetching GA4 active visitors:', error);
        // Return 0 on error to prevent crashes
        return 0;
    }
};

/**
 * Get active visitors with caching to avoid excessive API calls
 * Cache expires after 30 seconds
 */
let cachedVisitors = 0;
let lastFetchTime = 0;
const CACHE_DURATION = 30000; // 30 seconds

export const getCachedActiveVisitors = async () => {
    const now = Date.now();

    // Return cached value if still fresh
    if (now - lastFetchTime < CACHE_DURATION) {
        return cachedVisitors;
    }

    // Fetch new data
    cachedVisitors = await getActiveVisitors();
    lastFetchTime = now;

    return cachedVisitors;
};
