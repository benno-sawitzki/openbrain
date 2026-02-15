module.exports = {
  apps: [{
    name: 'openbrain',
    script: 'dist/server.js',
    env: {
      NODE_ENV: 'production',
      MARKETING_HQ_PORT: 4000,
    },
    // Cloud env vars loaded from .env via --env flag or set in the environment
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_memory_restart: '256M',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
};
