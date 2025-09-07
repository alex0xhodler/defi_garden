// Quick script to fix stuck monitoring database state
const { stopDepositMonitoring, getUsersForBalanceMonitoring } = require("./src/lib/database");

console.log("🔧 Fixing stuck monitoring database state...");

// Get current users
const users = getUsersForBalanceMonitoring();
const currentTime = Date.now();

console.log("Current users in monitoring:", users.map(u => ({
  userId: u.userId,
  firstName: u.firstName,
  expectingUntil: u.expectingDepositUntil,
  isExpired: u.expectingDepositUntil < currentTime,
  expiresIn: u.expectingDepositUntil ? Math.floor((u.expectingDepositUntil - currentTime) / 1000) + "s" : "null"
})));

// Clean up all stuck monitoring states
users.forEach(user => {
  console.log(`🧹 Stopping monitoring for user ${user.userId} (${user.firstName})`);
  stopDepositMonitoring(user.userId);
});

console.log("✅ All monitoring states cleared");
console.log("Now only users who actively request deposit addresses will be monitored");

// Verify cleanup
const usersAfter = getUsersForBalanceMonitoring();
console.log(`After cleanup: ${usersAfter.length} users being monitored`);