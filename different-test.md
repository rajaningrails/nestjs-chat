<!-- # Run test
artillery run load-test.yml

# Generate report
artillery run --output report.json load-test.yml
artillery report report.json -->


<!-- # Real-time monitoring
pm2 monit

# List processes with stats
pm2 list

# Detailed process info
pm2 show chat-app

# CPU/Memory usage
pm2 describe chat-app

# Logs
pm2 logs chat-app --lines 100
pm2 logs chat-app --err  # Error logs only
pm2 logs chat-app --out  # Output logs only -->


<!-- # Redis CLI
redis-cli

# Monitor commands in real-time
redis-cli MONITOR

# Get info
redis-cli INFO stats
redis-cli INFO memory
redis-cli INFO clients

# Check memory usage
redis-cli MEMORY STATS

# Check connected clients
redis-cli CLIENT LIST -->


<!-- # Start
pm2 start ecosystem.config.js --env production

# Monitor
pm2 monit
pm2 logs chat-app

# Reload (zero-downtime)
pm2 reload chat-app

# Scale workers
pm2 scale chat-app 6

# Health check
curl http://localhost:3000/health -->