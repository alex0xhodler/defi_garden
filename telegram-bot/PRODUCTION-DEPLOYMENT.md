# 🚀 Production Deployment Guide - Gasless Transaction Improvements

## 📋 Pre-Deployment Checklist

- [ ] All local testing completed
- [ ] Bot running successfully in development
- [ ] Database migration script tested locally
- [ ] Environment variables configured on production server
- [ ] PM2 process manager available on production server

## 🌟 Branch Deployment Strategy (Recommended)

### Step 1: Push to Feature Branch
```bash
# On your local machine
git add .
git commit -m "feat: Enhanced gasless transaction flow with auto-retry and improved UX"
git push origin gasless-improvements

# Or whatever branch name you prefer
git push origin feature/enhanced-gasless-flow
```

### Step 2: Production Server - Branch Deployment
```bash
# SSH into your production server
ssh your-server

# Navigate to your bot directory
cd /path/to/your/telegram-bot

# Fetch the new branch
git fetch origin

# Switch to the feature branch
git checkout gasless-improvements
# OR
git checkout feature/enhanced-gasless-flow

# Install any new dependencies
npm install

# **CRITICAL**: Run database migration ONCE
npm run migrate:prod
# OR manually run:
node -e "const {runIndexTablesMigration} = require('./dist/lib/database.js'); runIndexTablesMigration(); process.exit(0);"
```

### Step 3: Deploy with PM2
```bash
# Stop the current bot process
pm2 stop telegram-bot

# Start with the new branch code
pm2 start ecosystem.config.js --env production
# OR if you don't have ecosystem config:
pm2 start index.ts --name telegram-bot --interpreter ts-node

# Check the process status
pm2 status
pm2 logs telegram-bot --lines 50

# Monitor for any issues
pm2 monit
```

## 🗄️ Database Migration Details

### Migration Script Analysis
The `migrations/add-index-tables.sql` script:
- ✅ Uses `CREATE TABLE IF NOT EXISTS` - safe to run multiple times
- ✅ Uses `INSERT OR IGNORE` - won't duplicate data
- ✅ Creates proper indexes for performance
- ✅ Includes sample data for LCAP token
- ✅ Has migration tracking table

### Migration Safety
**The migration is SAFE to run multiple times because:**
- All DDL statements use `IF NOT EXISTS`
- All data inserts use `INSERT OR IGNORE` 
- Existing data will not be affected
- Production database won't be overwritten

### Current Migration Trigger
The migration runs automatically at bot startup in `src/lib/database.ts`:
```typescript
// Line 169-173
try {
  runIndexTablesMigration();
} catch (error: any) {
  console.error("Error running index tables migration:", error);
}
```

## 🚀 Production Testing Phase

### Step 1: Verify Bot Startup
```bash
# Check PM2 logs for successful startup
pm2 logs telegram-bot --lines 20

# Look for these success messages:
# ✅ Index tables migration completed successfully
# 🦑 Starting inkvest Telegram Bot...
# ✅ Bot started successfully!
```

### Step 2: Test Critical Flows
1. **Basic Functionality**: `/start`, `/balance`, `/portfolio`
2. **Index Token Flow**: 
   - Go to index tokens menu
   - Select LCAP token
   - Enter amount (should trigger gasless flow)
   - Verify improved messaging appears
3. **Address Copying**: Click "📋 Copy Address" button
4. **Auto-retry**: Click "🔄 Check & Retry" button
5. **Cancellation**: Click "❌ Cancel Purchase" button

### Step 3: Monitor Performance
```bash
# Monitor PM2 process health
pm2 monit

# Check memory usage
pm2 show telegram-bot

# Watch logs in real-time
pm2 logs telegram-bot --follow
```

## ✅ Production Validation

### Success Indicators
- [ ] Bot starts without errors
- [ ] Database migration completes successfully  
- [ ] Index token menu displays LCAP option
- [ ] Gasless transaction flow shows improved messaging
- [ ] Address copying works with backtick formatting
- [ ] Auto-retry mechanism triggers after 30 seconds
- [ ] Error handling works gracefully
- [ ] Session management functions properly

### Performance Metrics
- [ ] Bot response time < 2 seconds
- [ ] Memory usage stable (check with `pm2 monit`)
- [ ] No callback query timeout errors
- [ ] Database queries executing efficiently

## 🔄 Rollback Plan (If Needed)

### If Issues Arise
```bash
# Quick rollback to main branch
git checkout main
pm2 restart telegram-bot

# Check status
pm2 status
pm2 logs telegram-bot --lines 20
```

**Note**: Database changes will remain (they're additive and safe), but the bot code will revert to the previous version.

## 🎯 Production Success → Merge to Main

### Once Testing Confirms Success
```bash
# On your local machine
git checkout main
git merge gasless-improvements
git push origin main

# On production server
git checkout main  
git pull origin main
pm2 restart telegram-bot
```

## ⚡ Optimization Notes

### Migration Startup Optimization
The current setup runs the migration at every startup, which is safe but not optimal. For better performance in production:

**Current**: Migration runs every time bot starts
**Optimization** (future): Add migration tracking to run only once

```typescript
// Future optimization - check if migration already applied
export function runIndexTablesMigrationOnce(): void {
  try {
    // Check if migration already applied
    const checkStmt = db.prepare("SELECT name FROM migrations WHERE name = ?");
    const applied = checkStmt.get('add-index-tables');
    
    if (!applied) {
      runIndexTablesMigration();
      console.log("✅ Index tables migration applied for first time");
    } else {
      console.log("✅ Index tables migration already applied, skipping");
    }
  } catch (error) {
    console.error("❌ Error checking migration status:", error);
    // Fallback to running migration (safe due to IF NOT EXISTS)
    runIndexTablesMigration();
  }
}
```

## 🔧 Troubleshooting

### Common Issues

**Bot won't start:**
```bash
pm2 logs telegram-bot --lines 50
# Look for specific error messages
```

**Database issues:**
```bash
# Check if database file exists and has correct permissions
ls -la data/
# Expected: inkvest.db should exist with read/write permissions
```

**Migration fails:**
```bash
# Check migration file exists
ls -la migrations/add-index-tables.sql

# Check if migration SQL is valid
sqlite3 data/inkvest.db < migrations/add-index-tables.sql
```

**Callback query errors:**
- Should be fixed by our auto-retry timeout improvements
- Check logs for "Error handling retry after transfer" messages
- These should no longer include "callback query expired" errors

---

## 🎉 Summary

This deployment guide ensures:
- ✅ **Safe branch-based deployment** for testing
- ✅ **Database migration safety** with no data loss risk
- ✅ **Performance monitoring** during rollout
- ✅ **Easy rollback** if issues arise
- ✅ **Clear success validation** criteria

The migration script is **production-ready** and will only need to run successfully **once** to create the new index token tables.