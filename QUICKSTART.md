# Quick Start Guide

## Installation

### Windows
```bash
.\setup.bat
```

### macOS/Linux
```bash
chmod +x setup.sh
./setup.sh
```

## Manual Setup

### 1. Install Dependencies
```bash
# Backend
cd Backend
npm install
cd ..

# Frontend
cd frontend
npm install
cd ..
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your configuration
```

### 3. Start Services
```bash
docker-compose up -d
```

## Testing

### Run All Tests
```bash
cd Backend
npm test
```

### Run Tests in Watch Mode
```bash
cd Backend
npm run test:watch
```

### Run Specific Test Suite
```bash
cd Backend
npm test -- rca.test.js
npm test -- debounce.test.js
npm test -- retry.test.js
```

## API Testing

### Test Signal Ingestion
```bash
curl -X POST http://localhost:8081/signals \
  -H "Content-Type: application/json" \
  -d '{
    "type": "error",
    "source": "api-server",
    "severity": "high",
    "description": "Database connection timeout"
  }'
```

### Get Metrics
```bash
curl http://localhost:8081/metrics/json | jq
```

### Check Health
```bash
curl http://localhost:8081/health | jq
```

### Get Incidents
```bash
curl http://localhost:8081/incidents | jq
```

## Docker Commands

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f worker
```

### Execute Commands
```bash
# Backend container
docker-compose exec backend npm test

# Worker container
docker-compose exec worker node -e "console.log('Worker is running')"
```

### Restart Services
```bash
docker-compose restart
docker-compose restart backend
```

### Stop Services
```bash
docker-compose down
docker-compose down -v  # Remove volumes too
```

## Database Access

### PostgreSQL
```bash
docker-compose exec postgres psql -U user -d ims
# List tables: \dt
# View incidents: SELECT * FROM incidents;
```

### MongoDB
```bash
docker-compose exec mongodb mongosh -u root -p root
# Use ims database: use ims
# View incidents: db.incidents.find().pretty()
```

### Redis
```bash
docker-compose exec redis redis-cli
# Get cache: GET incident:123
# List keys: KEYS ims:*
```

### RabbitMQ Management UI
```
http://localhost:15672
Username: guest
Password: guest
```

## Troubleshooting

### Services not starting
```bash
# Clean up and restart
docker-compose down -v
docker-compose up -d
```

### Database connection errors
```bash
# Check if database is healthy
docker-compose exec postgres pg_isready
docker-compose exec mongodb mongosh --eval "db.adminCommand('ping')"
```

### High memory usage
```bash
# Check container resource usage
docker stats

# Reduce cache size in index.js
# Reduce batch size in worker.js
```

### Queue backlog
```bash
# Check RabbitMQ queue depth
curl http://localhost:15672/api/queues/%2F/signals \
  -u guest:guest | jq '.messages'
```

## Performance Monitoring

### View Real-time Metrics
```bash
watch -n 1 'curl -s http://localhost:8081/metrics/json | jq .metrics'
```

### Monitor Database Connections
```bash
watch -n 2 'docker-compose exec postgres psql -U user -d ims -c "SELECT count(*) FROM pg_stat_activity;"'
```

### Check Cache Statistics
```bash
curl -s http://localhost:8081/metrics/json | jq '.metrics | select(.cache_hits)'
```

## Development Workflow

### 1. Make Code Changes
```bash
# Edit files in Backend/ or frontend/
vim Backend/index.js
```

### 2. Rebuild Docker Image (if needed)
```bash
docker-compose build backend
docker-compose restart backend
```

### 3. View Logs
```bash
docker-compose logs -f backend
```

### 4. Test Changes
```bash
cd Backend
npm test
```

## Production Deployment

### Using Docker Stack (Swarm)
```bash
docker stack deploy -c docker-compose.yml ims
```

### Using Kubernetes
```bash
# Convert docker-compose to Kubernetes manifests
kompose convert -f docker-compose.yml

# Deploy
kubectl apply -f .
```

### Environment Variables for Production
```bash
NODE_ENV=production
SLACK_WEBHOOK_URL=your-webhook-url
WEBHOOK_URL=your-webhook-endpoint
# Configure security keys, SSL certs, etc.
```

## Support

For detailed information:
- Architecture: See ENHANCEMENTS.md
- Performance tuning: See PERFORMANCE_GUIDE.md
- Code examples: Check __tests__ directory
