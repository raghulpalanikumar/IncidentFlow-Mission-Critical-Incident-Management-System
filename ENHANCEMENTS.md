# Enhanced Incident Management System

## Overview

This Incident Management System (IMS) has been enhanced with enterprise-grade features for reliability, observability, and performance.

## Features Implemented

### 1. Alert Notification Integration
- **Slack Integration**: Send critical incidents and resolutions to Slack
- **Webhook Support**: Generic webhook support for custom integrations
- **Severity-based Routing**: Different handling for critical, high, medium, and low severity incidents

**Configuration:**
```bash
export SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
export WEBHOOK_URL=https://your-webhook-endpoint.com/incidents
```

**Usage:**
```javascript
const { AlertService } = require('./utils/alerts');
const alertService = new AlertService();

// Send critical alert
await alertService.alertCritical(incident);

// Send resolution alert
await alertService.alertResolved(incident, mttr);

// Send webhook
await alertService.sendWebhook(data, metadata);
```

### 2. Retry Mechanism with Exponential Backoff
- **3 Attempts by Default**: Configurable retry attempts
- **Exponential Backoff**: Prevents overwhelming failed services
- **Custom Error Handling**: Preserves original error information
- **Retry Callbacks**: Monitor retry attempts in real-time

**Configuration:**
```javascript
const { retryWithBackoff } = require('./utils/retry');

// Basic usage
await retryWithBackoff(
  () => dbOperation(),
  3,           // max attempts
  1000,        // initial delay (ms)
  2,           // backoff multiplier
  (retry) => console.log(`Retry ${retry.attempt}`)
);
```

**Backoff Schedule:**
- Attempt 1: Immediate
- Attempt 2: 1s delay
- Attempt 3: 2s delay
- Attempt 4: 4s delay (exponential growth)

### 3. Metrics Tracking
Comprehensive metrics collection using Prometheus format:

**Available Metrics:**
- `ims_total_signals`: Total signals received
- `ims_incidents_created`: Total incidents created by severity
- `ims_mttr_seconds`: Mean Time To Resolution distribution
- `ims_db_write_attempts`: Database write success/failure ratio
- `ims_queue_depth`: Current signal queue depth
- `ims_signal_processing_time_ms`: Signal processing duration

**Endpoints:**
```bash
# Prometheus format metrics
GET /metrics

# JSON format metrics
GET /metrics/json
```

**Response Example:**
```json
{
  "metrics": {
    "ims_total_signals": 1250,
    "ims_incidents_created": 45,
    "ims_mttr_seconds": 342.5
  },
  "debounceState": {
    "windowMs": 5000,
    "activeSignals": 3
  }
}
```

### 4. Performance Optimizations

#### A. Connection Pooling
- PostgreSQL: Max 20 connections, idle timeout 30s
- MongoDB: Max pool size 10, min pool size 2
- Automatic health checks and reconnection

#### B. Caching Strategy
- **Two-tier Cache**: In-memory + Redis
- **LRU Eviction**: Automatic cleanup of old entries
- **Cache Statistics**: Monitor hit rate and performance

```javascript
const { CacheManager } = require('./utils/cache');
const cache = new CacheManager(redisClient);

await cache.set('incident:123', incidentData, 300); // 5 min TTL
const cached = await cache.get('incident:123');
const stats = cache.getStats(); // { hits: 100, misses: 25, hitRate: '80%' }
```

#### C. Batch Processing
- Groups signals for efficient bulk processing
- Auto-flush on batch size or time threshold
- Ideal for burst traffic handling

```javascript
const { BatchProcessor } = require('./utils/batch');
const batcher = new BatchProcessor({
  batchSize: 50,
  flushIntervalMs: 5000
});

await batcher.addToBatch('signals', signal, async (batch) => {
  return await processSignalBatch(batch);
});
```

#### D. Circuit Breaker Pattern
- Prevents cascading failures
- Three states: CLOSED, OPEN, HALF_OPEN
- Automatic recovery mechanism

```javascript
const { CircuitBreaker } = require('./utils/circuitbreaker');
const breaker = new CircuitBreaker({
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 60000
});

await breaker.execute(() => unreliableService());
```

#### E. Connection Pool Monitoring
- Real-time pool health tracking
- Utilization alerts (80%+)
- Performance metrics

### 5. Debouncing Logic
Prevents duplicate incident creation from identical signals within a 5-second window.

**Features:**
- Automatic signal deduplication
- Configurable time window
- Per-signal-type tracking

```javascript
const { DebounceManager } = require('./utils/debounce');
const debounce = new DebounceManager(5000); // 5 second window

if (debounce.isDuplicate(signal)) {
  // Skip processing - duplicate signal
  return;
}
```

### 6. Test Coverage
Comprehensive test suite included:

**Test Files:**
- `__tests__/rca.test.js`: RCA validation (25+ tests)
- `__tests__/debounce.test.js`: Debouncing logic (20+ tests)
- `__tests__/retry.test.js`: Retry mechanism (15+ tests)

**Run Tests:**
```bash
npm test                 # Run all tests
npm run test:watch     # Watch mode
```

## API Endpoints

### Health Check
```bash
GET /health
```
Response: System and database status

### Signals
```bash
POST /signals
Content-Type: application/json

{
  "type": "error",
  "source": "api-server",
  "severity": "high",
  "description": "Database connection timeout",
  "metadata": { "endpoint": "/api/users" }
}
```

### Incidents
```bash
# Get all open incidents
GET /incidents?status=open

# Get specific incident
GET /incidents/:id

# Resolve incident
POST /incidents/:id/resolve

# Add RCA
POST /incidents/:id/rca
Content-Type: application/json

{
  "description": "Connection pool exhaustion",
  "rootCause": "Unoptimized query with N+1 problem",
  "actionItems": [
    "Implement query batching",
    "Add index to user_id column",
    "Monitor connection pool usage"
  ]
}
```

### Metrics
```bash
# Prometheus format
GET /metrics

# JSON format with state
GET /metrics/json
```

## Performance Recommendations

### For Burst Traffic
1. **Increase batch size** in `BatchProcessor` config
2. **Expand connection pools** in `docker-compose.yml`
3. **Enable Redis caching** for frequently accessed incidents
4. **Use circuit breaker** for external API calls

### Resource Allocation
- **Backend**: 1 CPU, 512MB RAM (minimum)
- **Worker**: 1 CPU, 512MB RAM (minimum)
- **PostgreSQL**: 2 CPU, 1GB RAM
- **MongoDB**: 2 CPU, 1GB RAM
- **Redis**: 0.5 CPU, 256MB RAM

### Tuning Parameters
Edit `docker-compose.yml` to adjust:
- PostgreSQL `max_connections`
- MongoDB connection pool size
- RabbitMQ prefetch count
- Cache TTL values

## Deployment

### Environment Variables
```bash
# Required
POSTGRES_USER=user
POSTGRES_PASSWORD=secure_password
POSTGRESQL_DB=ims
MONGODB_URL=mongodb://mongodb:27017/ims

# Optional
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
WEBHOOK_URL=https://your-webhook-endpoint.com/incidents
```

### Docker Compose
```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f backend
docker-compose logs -f worker

# Stop services
docker-compose down
```

## Monitoring

### Health Checks
- Backend: `/health` endpoint
- Worker: Process heartbeat in logs
- Database: Connection pool monitoring
- RabbitMQ: Queue depth monitoring

### Key Metrics to Monitor
1. **Signal Processing**: `ims_signal_processing_time_ms` (target: <500ms)
2. **MTTR**: `ims_mttr_seconds` (target: <1800s)
3. **Incident Creation**: `ims_incidents_created` (trend analysis)
4. **Cache Hit Rate**: `cache.stats.hitRate` (target: >70%)
5. **Queue Depth**: `ims_queue_depth` (alert if >1000)

## Troubleshooting

### High Memory Usage
- Reduce `maxLocalSize` in `CacheManager`
- Decrease batch size in `BatchProcessor`
- Increase cleanup frequency in debounce manager

### Queue Backlog
- Increase worker replicas
- Reduce `flushIntervalMs` in batch processor
- Check database write performance

### Connection Pool Exhaustion
- Increase `max_connections` in database config
- Review long-running queries
- Check for connection leaks in code

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Frontend (React/Vite)                                   │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP
┌──────────────────────▼──────────────────────────────────┐
│ Backend API (Express)                                   │
│ - Signal ingestion                                      │
│ - Incident management                                  │
│ - Alert notifications                                  │
│ - Metrics collection                                   │
└──────────────────────┬──────────────────────────────────┘
                       │ Durable Queue
┌──────────────────────▼──────────────────────────────────┐
│ RabbitMQ Message Queue                                  │
└──────────────────────┬──────────────────────────────────┘
         ┌─────────────┴──────────────┬────────────────────┐
         │                            │                    │
    Worker 1                      Worker 2            Worker N
    ┌────────┐                ┌────────┐            ┌────────┐
    │ Process│                │Process │            │Process │
    │ Signals│                │Signals │            │Signals │
    │ Create │                │Create  │            │Create  │
    │Incidents│               │Incidents│           │Incidents│
    └────────┘                └────────┘            └────────┘
         │                        │                    │
         └────────────┬───────────┴────────────────────┘
                      │
      ┌───────────────┼───────────────┐
      │               │               │
   MongoDB        PostgreSQL         Redis
   (Incidents)    (Audit Log)     (Cache)
```

## License

ISC

## Support

For issues or questions, check the test files for usage examples or review the inline documentation in utils/ and models/ directories.
