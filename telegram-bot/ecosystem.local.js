module.exports = {
  apps: [
    {
      name: 'inkvest-bot-local',
      script: './node_modules/.bin/ts-node',
      args: 'index.ts',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development'
      },
      watch: false,
      restart_delay: 1000,
      log_file: './logs/bot.log',
      out_file: './logs/bot-out.log',
      error_file: './logs/bot-error.log',
      pid_file: './logs/bot.pid',
      time: true
    },
    {
      name: 'event-monitor-local',
      script: 'node',
      args: 'src/services/event-monitor.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development'
      },
      watch: false,
      restart_delay: 2000,
      log_file: './logs/event-monitor.log',
      out_file: './logs/event-monitor-out.log',
      error_file: './logs/event-monitor-error.log',
      pid_file: './logs/event-monitor.pid',
      time: true
    }
  ]
};