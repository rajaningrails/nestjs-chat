module.exports = {
  apps: [
    {
      name: 'chat-app',
      script: './dist/main.js',
      
      instances: 4, // Number of instances (use 4 for 4-core CPU)
      exec_mode: 'cluster',
      
      max_memory_restart: '900M', // Restart if memory exceeds 900MB
      
      // Auto-restart configuration
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: '10s',
      
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
        DB_HOST: 'localhost',
        DB_PORT: 3306,
        DB_USER: 'admin',
        DB_PASSWORD: 'password',
        DB_NAME: 'chat',
        REDIS_HOST: 'localhost',
        REDIS_PORT: 6379,
      },
      
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        DB_HOST: 'localhost',
        DB_PORT: 3306,
        DB_USER: 'admin',
        DB_PASSWORD: 'password',
        DB_NAME: 'chatdb',
        REDIS_HOST: 'localhost',
        REDIS_PORT: 6379,
      },
      
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      kill_timeout: 5000,
      listen_timeout: 10000,
      shutdown_with_message: true,
      
      node_args: '--max-old-space-size=512', // 512MB heap per worker
    },
  ],
};