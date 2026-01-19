# Quick Fix: Complete HomeScreen Optimization

## Issue
The HomeScreen still starts data fetching immediately on mount, which can block navigation.

## Solution
Add a loadPhase check to defer data fetching until after the initial render.

## Code Changes

### Location
File: `src/screens/HomeScreen.js`
Line: ~53 (inside the first useEffect)

### Current Code
```javascript
useEffect(() => {
    const workQuery = query(collection(db, "orders"), where("cod_status", "in", ["pending", "confirmed"]));
    // ... rest of code
}, []);
```

### Updated Code
```javascript
useEffect(() => {
    // Defer data fetching until Phase 2
    if (loadPhase < 2) {
        return;
    }
    
    const workQuery = query(collection(db, "orders"), where("cod_status", "in", ["pending", "confirmed"]));
    // ... rest of code
}, [loadPhase]); // Add loadPhase to dependency array
```

## Steps
1. Open `src/screens/HomeScreen.js`
2. Find the first `useEffect` (around line 53)
3. Add the loadPhase check at the very beginning
4. Add `loadPhase` to the dependency array at the end

## Why This Helps
- Screen renders immediately with skeleton UI
- Data fetching starts 100ms later (Phase 2)
- Navigation feels instant
- No blocking on the main thread

## Alternative: Manual Edit
If the automated tool has issues with arrow function syntax, you can:
1. Manually add the 4 lines after `useEffect(() => {`
2. Change the dependency array from `[]` to `[loadPhase]`
