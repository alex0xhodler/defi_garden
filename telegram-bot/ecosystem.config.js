module.exports = {
  apps: [
    {
      name: 'inkvest-bot',
      script: './node_modules/.bin/ts-node',
      args: 'index.ts',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development'
      },
      watch: false,
      restart_delay: 1000
    },
    {
      name: 'event-monitor',
      script: 'node',
      args: 'src/services/event-monitor.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development'
      },
      watch: false,
      restart_delay: 2000
    }
  ]
};
