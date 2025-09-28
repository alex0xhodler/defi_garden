# 🚀 Production Deployment Guide

## Quick Deploy Commands

### On Production Server:

```bash
# 1. Pull latest changes
git pull origin main

# 2. Install dependencies (if needed)
npm install

# 3. Stop existing processes
pm2 delete ecosystem.config.js

# 4. Start with production config
pm2 start ecosystem.config.js

# 5. Save PM2 configuration
pm2 save

# 6. Setup PM2 startup (first time only)
pm2 startup
```

### Monitoring Commands:

```bash
# Real-time monitoring dashboard
pm2 monit

# Check process status
pm2 status

# View logs
pm2 logs

# View bot logs only
pm2 logs inkvest-bot

# View event monitor logs only  
pm2 logs event-monitor

# Restart if needed
pm2 restart all
```

### Troubleshooting:

```bash
# If infinite monitoring issue returns:
pm2 logs event-monitor | grep "getUsersForBalanceMonitoring"

# Check for WebSocket connection issues:
pm2 logs event-monitor | grep "WebSocket"

# Restart just the event monitor:
pm2 restart event-monitor

# Check database queries:
pm2 logs | grep "expectingUntil:null"
```

## Key Changes Deployed:

✅ **Fixed infinite monitoring bug** - Users like Alex won't get stuck anymore  
✅ **Updated WebSocket endpoint** - Now uses reliable Tenderly endpoint  
✅ **Enhanced monitoring context** - Better tracking of monitoring reasons  
✅ **Improved error handling** - More robust WebSocket reconnection  
✅ **Local testing environment** - Easy local debugging with PM2

## Environment Variables Required:

Make sure these are set on production:
- `TELEGRAM_BOT_TOKEN`
- `COINBASE_API_KEY_NAME` 
- `COINBASE_PRIVATE_KEY`
- `ALCHEMY_API_KEY`
- Other DeFi protocol API keys

## Database Backup:

A backup is included in the repo as `defi-garden.sqlite.backup`. Use recovery scripts if needed.