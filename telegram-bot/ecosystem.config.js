module.exports = {
  apps: [
    {
      name: 'defi-garden-bot',
      script: './index.ts',
      interpreter: 'ts-node',
      node_args: '--max-old-space-size=1024',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        UV_THREADPOOL_SIZE: 4
      },
      max_memory_restart: '900M',
      min_uptime: '10s',
      max_restarts: 5,
      log_file: './logs/bot-combined.log',
      out_file: './logs/bot-out.log',
      error_file: './logs/bot-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm Z',
      watch: false,
      restart_delay: 1000
    },
    {
      name: 'deposit-monitor',
      script: './src/services/deposit-monitor.ts',
      interpreter: 'ts-node', 
      node_args: '--max-old-space-size=512',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        UV_THREADPOOL_SIZE: 2
      },
      max_memory_restart: '400M',
      min_uptime: '10s',
      max_restarts: 10,
      log_file: './logs/monitor-combined.log',
      out_file: './logs/monitor-out.log',
      error_file: './logs/monitor-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm Z',
      watch: false,
      restart_delay: 5000,
      cron_restart: '0 0 * * *' // Restart daily at midnight for health
    }
  ]
};