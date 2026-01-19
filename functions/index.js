/**
 * Cloud Functions Entry Point
 * 
 * This file exports triggers from the /triggers directory.
 * This structure allows for cleaner separation of concerns and easier scalability.
 */

const authTriggers = require('./triggers/auth');
const userTriggers = require('./triggers/users');

// Export Auth Triggers
exports.cleanupUserData = authTriggers.cleanupUserData;

// Export Firestore Triggers
exports.deleteAuthUser = userTriggers.deleteAuthUser;

// To add new domains:
// exports.orderTriggers = require('./triggers/orders');
