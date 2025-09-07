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

// Clean up only John's stuck monitoring state (keep new users intact)
users.forEach(user => {
  if (user.userId === "491812750") { // John's stuck state
    console.log(`🧹 Stopping stuck monitoring for John (${user.userId})`);
    stopDepositMonitoring(user.userId);
  } else {
    console.log(`✅ Keeping monitoring for ${user.firstName} (${user.userId}) - this is normal`);
  }
});

console.log("✅ All monitoring states cleared");
console.log("Now only users who actively request deposit addresses will be monitored");

// Verify cleanup
const usersAfter = getUsersForBalanceMonitoring();
console.log(`After cleanup: ${usersAfter.length} users being monitored`);