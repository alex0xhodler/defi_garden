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

// Clean up John's stuck state completely (reset everything)
const { getDatabase } = require("./src/lib/database");
const db = getDatabase();

users.forEach(user => {
  if (user.userId === "491812750") { // John's stuck state
    console.log(`🧹 Resetting ALL flags for John - fresh start`);
    
    // Clear ALL monitoring-related flags so he gets fresh timestamps when he starts again
    db.prepare(`
      UPDATE users SET 
        expectingDepositUntil = NULL,
        lastBalanceCheck = NULL,
        onboardingCompleted = NULL
      WHERE userId = ?
    `).run(user.userId);
    
    console.log(`✅ John reset completely - will get fresh timestamps on next /start`);
  } else {
    console.log(`✅ Keeping ${user.firstName} (${user.userId}) unchanged`);
  }
});

console.log("✅ All monitoring states cleared");
console.log("Now only users who actively request deposit addresses will be monitored");

// Verify cleanup
const usersAfter = getUsersForBalanceMonitoring();
console.log(`After cleanup: ${usersAfter.length} users being monitored`);