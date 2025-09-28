#!/bin/bash

# Local PM2 Testing Script for inkvest bot
# Provides production-like environment locally

echo "🦑 inkvest Local PM2 Testing Environment"
echo "========================================"

# Function to show usage
show_usage() {
  echo "Usage: ./scripts/local-pm2.sh [COMMAND]"
  echo ""
  echo "Commands:"
  echo "  start     - Start both bot and event monitor"
  echo "  stop      - Stop all processes"
  echo "  restart   - Restart all processes" 
  echo "  status    - Show status of all processes"
  echo "  logs      - Show logs (live tail)"
  echo "  logs-bot  - Show bot logs only"
  echo "  logs-monitor - Show event monitor logs only"
  echo "  reset     - Stop, delete, and restart all"
  echo ""
}

case "$1" in
  start)
    echo "🚀 Starting local inkvest environment..."
    pm2 start ecosystem.local.js
    echo ""
    echo "✅ Started! Use 'pm2 monit' for real-time monitoring"
    echo "📊 Or use './scripts/local-pm2.sh status' for quick status"
    ;;
  
  stop)
    echo "🛑 Stopping local inkvest environment..."
    pm2 stop ecosystem.local.js
    ;;
    
  restart)
    echo "🔄 Restarting local inkvest environment..."
    pm2 restart ecosystem.local.js
    ;;
    
  status)
    echo "📊 Local inkvest Status:"
    echo "======================="
    pm2 list
    echo ""
    echo "💾 Memory Usage:"
    pm2 monit --no-interaction | grep -E "(inkvest-bot-local|event-monitor-local)"
    ;;
    
  logs)
    echo "📋 Showing live logs (Ctrl+C to exit)..."
    pm2 logs
    ;;
    
  logs-bot)
    echo "🤖 Bot logs (Ctrl+C to exit)..."
    pm2 logs inkvest-bot-local
    ;;
    
  logs-monitor)
    echo "👁️ Event Monitor logs (Ctrl+C to exit)..."
    pm2 logs event-monitor-local
    ;;
    
  reset)
    echo "🔥 Resetting local environment..."
    pm2 delete ecosystem.local.js 2>/dev/null || true
    pm2 start ecosystem.local.js
    echo "✅ Environment reset complete!"
    ;;
    
  *)
    show_usage
    ;;
esac