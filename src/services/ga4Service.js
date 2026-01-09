/**
 * GA4 Analytics Service
 * Fetches comprehensive real-time analytics data from our Vercel API
 */

// Always use production Vercel URL (API runs on Vercel, not locally)
const API_BASE_URL = 'https://easey-app.vercel.app';

/**
 * Fetch comprehensive GA4 analytics
 * @returns {Promise<Object>} Complete analytics data
 */
export const getComprehensiveAnalytics = async () => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/google-analytics`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data; // Returns { overview, trafficSources, devices, locations, topPages, timestamp }
    } catch (error) {
        console.error('Error fetching GA4 analytics:', error);
        return {
            overview: {
                activeUsers: 0,
                pageViews: 0,
                events: 0,
                avgSessionDuration: 0
            },
            trafficSources: [],
            devices: { desktop: 0, mobile: 0, tablet: 0 },
            locations: [],
            locations: [],
            topPages: [],
            topEvents: [],
            operatingSystems: [],
            error: error.message
        };
    }
};

/**
 * Fetch detailed visitors (Legacy format for backward compatibility)
 * @returns {Promise<Object>} { activeVisitors: number, details: Array }
 */
export const getDetailedVisitors = async () => {
    try {
        const data = await getComprehensiveAnalytics();

        // Convert new format to legacy format
        const details = data.locations.map(loc => ({
            city: loc.city,
            country: loc.country,
            device: 'unknown', // Device info is now separate
            count: loc.users
        }));

        return {
            activeVisitors: data.overview.activeUsers,
            details: details,
            timestamp: data.timestamp
        };
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
    const data = await getComprehensiveAnalytics();
    return data.overview.activeUsers || 0;
};

/**
 * Get comprehensive analytics with caching to avoid excessive API calls
 * Cache expires after 30 seconds
 */
let cachedData = {
    overview: {
        activeUsers: 0,
        pageViews: 0,
        events: 0,
        avgSessionDuration: 0
    },
    trafficSources: [],
    devices: { desktop: 0, mobile: 0, tablet: 0 },
    locations: [],
    locations: [],
    topPages: [],
    topEvents: [],
    operatingSystems: []
};
let lastFetchTime = 0;
const CACHE_DURATION = 30000; // 30 seconds

export const getCachedAnalytics = async () => {
    const now = Date.now();

    // Return cached value if still fresh
    if (now - lastFetchTime < CACHE_DURATION) {
        return cachedData;
    }

    // Fetch new data
    cachedData = await getComprehensiveAnalytics();
    lastFetchTime = now;

    return cachedData;
};

/**
 * Legacy: Get active visitors with caching
 */
export const getCachedActiveVisitors = async () => {
    const data = await getCachedAnalytics();
    return data.overview.activeUsers;
};

/**
 * Legacy: Get full cached data (including details)
 */
export const getCachedDetailedVisitors = async () => {
    const data = await getCachedAnalytics();

    // Convert to legacy format
    const details = data.locations.map(loc => ({
        city: loc.city,
        country: loc.country,
        device: 'unknown',
        count: loc.users
    }));

    return {
        activeVisitors: data.overview.activeUsers,
        details: details,
        timestamp: data.timestamp
    };
};
