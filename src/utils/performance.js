import { useCallback, useRef, useEffect } from 'react';

/**
 * Custom hook for debouncing values
 * @param {any} value - The value to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {any} - Debounced value
 */
export const useDebounce = (value, delay = 300) => {
    const [debouncedValue, setDebouncedValue] = React.useState(value);

    React.useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);

    return debouncedValue;
};

/**
 * Custom hook for throttling function calls
 * @param {Function} callback - Function to throttle
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} - Throttled function
 */
export const useThrottle = (callback, delay = 300) => {
    const lastRun = useRef(Date.now());

    return useCallback((...args) => {
        const now = Date.now();
        if (now - lastRun.current >= delay) {
            callback(...args);
            lastRun.current = now;
        }
    }, [callback, delay]);
};

/**
 * Memoized FlatList item layout calculator
 * @param {number} itemHeight - Fixed height of each item
 * @returns {Function} - getItemLayout function for FlatList
 */
export const getItemLayout = (itemHeight) => (data, index) => ({
    length: itemHeight,
    offset: itemHeight * index,
    index,
});

/**
 * Performance monitoring utility
 */
export class PerformanceMonitor {
    static marks = {};

    static start(label) {
        this.marks[label] = Date.now();
    }

    static end(label) {
        if (this.marks[label]) {
            const duration = Date.now() - this.marks[label];
            console.log(`[Performance] ${label}: ${duration}ms`);
            delete this.marks[label];
            return duration;
        }
        return 0;
    }

    static measure(label, fn) {
        this.start(label);
        const result = fn();
        this.end(label);
        return result;
    }

    static async measureAsync(label, fn) {
        this.start(label);
        const result = await fn();
        this.end(label);
        return result;
    }
}

/**
 * Batch state updates to reduce re-renders
 */
export const useBatchedUpdates = () => {
    const updates = useRef({});
    const timeoutRef = useRef(null);

    const batchUpdate = useCallback((key, value, setter, delay = 100) => {
        updates.current[key] = { value, setter };

        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
            Object.entries(updates.current).forEach(([_, { value, setter }]) => {
                setter(value);
            });
            updates.current = {};
        }, delay);
    }, []);

    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    return batchUpdate;
};

/**
 * Optimize image loading with lazy loading
 */
export const optimizeImageUri = (uri, width = 400, quality = 80) => {
    if (!uri) return null;

    // If it's a Shopify CDN image, add size parameters
    if (uri.includes('cdn.shopify.com')) {
        const url = new URL(uri);
        url.searchParams.set('width', width.toString());
        url.searchParams.set('quality', quality.toString());
        return url.toString();
    }

    return uri;
};

/**
 * Memory-efficient array chunking
 */
export const chunkArray = (array, size) => {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
};

/**
 * Memoize expensive computations
 */
export const memoize = (fn) => {
    const cache = new Map();
    return (...args) => {
        const key = JSON.stringify(args);
        if (cache.has(key)) {
            return cache.get(key);
        }
        const result = fn(...args);
        cache.set(key, result);
        return result;
    };
};

/**
 * Clear cache after certain size to prevent memory leaks
 */
export const createLRUCache = (maxSize = 100) => {
    const cache = new Map();

    return {
        get: (key) => {
            if (!cache.has(key)) return undefined;
            const value = cache.get(key);
            // Move to end (most recently used)
            cache.delete(key);
            cache.set(key, value);
            return value;
        },
        set: (key, value) => {
            if (cache.has(key)) {
                cache.delete(key);
            } else if (cache.size >= maxSize) {
                // Remove least recently used (first item)
                const firstKey = cache.keys().next().value;
                cache.delete(firstKey);
            }
            cache.set(key, value);
        },
        clear: () => cache.clear(),
        size: () => cache.size
    };
};
