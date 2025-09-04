# Production Deployment Plan: Database-Based Smart Account Tracking

## Overview
This fix resolves the AA10 "sender already constructed" error by tracking Smart Account deployment status in the database instead of making expensive blockchain calls.

## ⚠️ Critical Changes
- **Database schema change**: Adds `isDeployed` column to `wallets` table
- **Breaking change**: Code expects this column to exist
- **No backward compatibility**: Must run migration before deploying code

## 📋 Pre-Deployment Checklist

### 1. Backup Production Database
```bash
# On production server
cp defi-garden.sqlite defi-garden.sqlite.backup-$(date +%Y%m%d-%H%M%S)
ls -la *.sqlite*
```

### 2. Stop Production Bot (Minimize Downtime)
```bash
pm2 stop telegram-bot
# or however you run the bot
```

### 3. Pull Latest Changes
```bash
git fetch origin
git checkout feature/deposit-automanaged-option
git pull origin feature/deposit-automanaged-option
```

### 4. Run Database Migration
```bash
# This adds the isDeployed column
node migrate-add-isdeployed.js
```

### 5. Update Existing Deployed Accounts
```bash
# This checks blockchain and updates existing deployed accounts
node update-deployed-accounts.js
```

### 6. Build and Start
```bash
npm run build
npm start
# or pm2 restart telegram-bot
```

## 📊 Expected Migration Results

### New Column Added
```sql
-- Migration adds this column:
ALTER TABLE wallets ADD COLUMN isDeployed INTEGER NOT NULL DEFAULT 0;
```

### Existing Account Updates
The `update-deployed-accounts.js` will:
- Check all `coinbase-smart-wallet` accounts marked as `isDeployed = 0`
- Query blockchain to see if they're actually deployed
- Update database accordingly

**Expected Output:**
```
🔍 Checking existing Smart Accounts for deployment status...
📊 Found X Smart Accounts marked as not deployed
✅ Updated Y deployed accounts in database
📝 Z accounts remain as not deployed
```

## 🔍 Production Verification Steps

### 1. Check Migration Success
```bash
sqlite3 defi-garden.sqlite "SELECT address, userId, isDeployed FROM wallets LIMIT 5;"
```

### 2. Test Bot Startup
- Look for logs showing database deployment status:
  ```
  🔗 Smart Account 0x... already deployed (from database)
  🚀 Smart Account 0x... not deployed yet (from database)
  ```

### 3. Test End-to-End Flow
- Create test user
- Deposit → Deploy to protocol (should work)
- Try withdrawal (should NOT get AA10 error)

## 🚨 Rollback Plan (If Things Go Wrong)

### Option 1: Quick Rollback
```bash
# Stop bot
pm2 stop telegram-bot

# Restore database backup
cp defi-garden.sqlite.backup-TIMESTAMP defi-garden.sqlite

# Checkout previous working commit
git checkout c284bc4  # (previous commit hash)

# Restart
pm2 start telegram-bot
```

### Option 2: Database-Only Rollback
```bash
# If code is fine but database is corrupted
cp defi-garden.sqlite.backup-TIMESTAMP defi-garden.sqlite
# Re-run migration
node migrate-add-isdeployed.js
node update-deployed-accounts.js
```

## 📈 Benefits After Deployment

1. **No More AA10 Errors**: Users can withdraw after deposits
2. **Better Performance**: No blockchain calls for deployment checks  
3. **Cleaner Logs**: Reduced verbose logging
4. **More Reliable**: Database is single source of truth

## 🔧 Monitoring After Deployment

### Success Indicators:
- No AA10 errors in logs
- Successful deposits and withdrawals
- Logs show "already deployed (from database)" 
- Performance improvement (faster responses)

### Red Flags:
- AA10 errors still appearing
- "Error retrieving Coinbase Smart Wallet" messages
- Database constraint errors
- Slow response times

## 📝 Database Schema After Migration

```sql
-- Updated wallets table
CREATE TABLE wallets (
    address TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    encryptedPrivateKey TEXT NOT NULL,
    type TEXT NOT NULL,
    createdAt INTEGER NOT NULL,
    autoCreated INTEGER NOT NULL DEFAULT 0,
    isDeployed INTEGER NOT NULL DEFAULT 0,  -- NEW COLUMN
    FOREIGN KEY (userId) REFERENCES users(userId)
);
```

## 🎯 Success Criteria

✅ Migration runs without errors  
✅ Existing accounts updated correctly  
✅ Bot starts without issues  
✅ No AA10 errors in production  
✅ Users can deposit and withdraw successfully  
✅ Performance improvement visible in logs  

## 📞 Emergency Contacts

- **Database Issues**: Restore from backup immediately
- **Code Issues**: Rollback to previous commit  
- **User Reports**: Check logs for AA10 errors
- **Performance Issues**: Monitor RPC call reduction

---

**Estimated Downtime**: 2-5 minutes (for migration + restart)  
**Risk Level**: Medium (database schema change)  
**Rollback Time**: 1-2 minutes (if needed)