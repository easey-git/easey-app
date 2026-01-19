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
exports.auditUserStatus = authTriggers.auditUserStatus;

// Export Firestore Triggers
exports.deleteAuthUser = userTriggers.deleteAuthUser;

// Export Actions (Callable)
const manageUsers = require('./actions/manageUsers');
exports.toggleUserStatus = manageUsers.toggleUserStatus;

// To add new domains:
// exports.orderTriggers = require('./triggers/orders');
// Export Utilities (Scheduled)
const utilsTriggers = require('./triggers/utils');
exports.cleanupOldLogs = utilsTriggers.cleanupOldLogs;
