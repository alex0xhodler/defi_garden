module.exports = {
  apps: [
    {
      name: 'inkvest-bot',
      script: './index.ts',
      interpreter: './node_modules/.bin/ts-node',
      node_args: ['--max-old-space-size=512'],
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production'
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
      name: 'event-monitor',
      script: './src/services/event-monitor.js',
      interpreter: './node_modules/.bin/ts-node',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        UV_THREADPOOL_SIZE: 2
      },
      max_memory_restart: '400M',
      min_uptime: '10s',
      max_restarts: 10,
      log_file: './logs/event-monitor-combined.log',
      out_file: './logs/event-monitor-out.log',
      error_file: './logs/event-monitor-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm Z',
      watch: false,
      restart_delay: 5000,
      cron_restart: '0 2 * * *' // Restart daily at 2 AM for health
    }
  ]
};