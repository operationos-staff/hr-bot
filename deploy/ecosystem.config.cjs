// PM2 конфиг — два процесса: бот + API для Mini App.
// Запуск: pm2 start deploy/ecosystem.config.cjs
// Сохранить автозапуск: pm2 save && pm2 startup

module.exports = {
  apps: [
    {
      name: 'bot-hh-habr',
      script: 'src/index.js',
      interpreter: 'node',
      cwd: '/home/ubuntu/Bot_HH_Habr',
      env_production: { NODE_ENV: 'production' },
      restart_delay: 10000,
      max_restarts: 10,
      min_uptime: '30s',
      out_file: './logs/pm2-out.log',
      error_file: './logs/pm2-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      max_memory_restart: '256M',
    },
    {
      name: 'bot-hh-habr-api',
      script: 'src/api/server.js',
      interpreter: 'node',
      cwd: '/home/ubuntu/Bot_HH_Habr',
      env_production: { NODE_ENV: 'production' },
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '30s',
      out_file: './logs/api-out.log',
      error_file: './logs/api-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      max_memory_restart: '256M',
    },
  ],
};
