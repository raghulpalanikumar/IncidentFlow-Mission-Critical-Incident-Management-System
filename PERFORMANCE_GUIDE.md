/**
 * Performance Optimization Guide
 * Best practices for running IMS at scale
 */

# Database Connection Optimization

## PostgreSQL
- Connection pooling: 20 connections max
- Idle timeout: 30 seconds
- Use prepared statements to prevent connection leaks
- Monitor with: `SELECT count(*) FROM pg_stat_activity;`

## MongoDB
- Use connection pooling (min: 2, max: 10)
- Create indexes on frequently queried fields
- Monitor memory with: `db.serverStatus().mem`

## Redis
- Set eviction policy: `allkeys-lru`
- Monitor memory with: `INFO memory`
- Use pipelining for batch operations

# Application-Level Optimization

## Caching Strategy
1. Cache incident summaries (frequently accessed)
2. Cache signal patterns (for debouncing)
3. Cache resolved incidents (older than 1 week)
4. Set appropriate TTL based on data volatility

```javascript
// Good cache candidates
- Incidents list (TTL: 60s)
- Incident details (TTL: 300s)
- Signal patterns (TTL: 10s)
- System metrics (TTL: 5s)
```

## Batch Processing
- Batch size: 50 signals (adjust based on RAM)
- Flush interval: 5000ms
- Monitor batch processing time in metrics

## Debouncing
- Window: 5000ms (tune based on alert patterns)
- Clear old entries every 30s
- Monitor active signals: `debounceManager.getState()`

## Rate Limiting
- Default: 100 requests per minute per IP
- Adjust based on expected traffic patterns
- Monitor with: `GET /metrics/json`

# Monitoring & Alerts

## Key Metrics
```
Signal Processing Time: <500ms (target)
MTTR: <30 minutes (SLO)
Cache Hit Rate: >70% (target)
Queue Depth: <1000 signals (warning)
Database Connection Utilization: <80% (warning)
```

## Health Checks
- Backend: GET /health (30s interval)
- PostgreSQL: pg_isready (10s interval)
- MongoDB: db.adminCommand('ping') (10s interval)
- Redis: PING (10s interval)
- RabbitMQ: rabbitmq-diagnostics (10s interval)

# Scaling Strategies

## Vertical Scaling (Single Instance)
1. Increase CPU/RAM allocation
2. Increase connection pool sizes
3. Increase batch size
4. Increase cache size

## Horizontal Scaling (Multiple Instances)
1. Run multiple backend instances (load balanced)
2. Run multiple workers (auto-scaled based on queue depth)
3. Use distributed cache (Redis cluster)
4. Use shared database (must support concurrent access)

## Load Balancing
```nginx
# Example Nginx config
upstream backend {
  server backend-1:8080;
  server backend-2:8080;
  server backend-3:8080;
}

server {
  listen 80;
  location / {
    proxy_pass http://backend;
    proxy_set_header X-Forwarded-For $remote_addr;
  }
}
```

# Query Optimization

## PostgreSQL Indexes (Add these if not present)
```sql
-- Incident queries
CREATE INDEX ON incidents(status, severity);
CREATE INDEX ON incidents(source, created_at DESC);
CREATE INDEX ON incidents("timeline.openedAt" DESC);

-- Signal queries
CREATE INDEX ON signals(processed, created_at DESC);
CREATE INDEX ON signals(incident_id);
CREATE INDEX ON signals(source, created_at DESC);
```

## MongoDB Indexes
```javascript
// Incident indexes
db.incidents.createIndex({ status: 1, severity: 1 });
db.incidents.createIndex({ "timeline.openedAt": -1 });
db.incidents.createIndex({ source: 1 });

// Signal indexes
db.signals.createIndex({ incident: 1 });
db.signals.createIndex({ processed: 1 });
db.signals.createIndex({ source: 1, createdAt: -1 });
```

# Container Resource Limits

## Recommended (Docker)
```yaml
backend:
  memory: 512M
  cpus: '1'

worker:
  memory: 512M
  cpus: '1'

postgres:
  memory: 1G
  cpus: '2'

mongodb:
  memory: 1G
  cpus: '2'

redis:
  memory: 256M
  cpus: '0.5'
```

## Auto-scaling (Kubernetes)
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: backend-autoscaler
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: backend
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

# Disaster Recovery

## Backup Strategy
1. PostgreSQL: Daily snapshots (retain 30 days)
2. MongoDB: Daily snapshots (retain 30 days)
3. Redis: RDB snapshots every 5 minutes
4. Configuration: Version control in Git

## Restore Procedure
1. Stop all services
2. Restore database backups
3. Verify data integrity
4. Start services

# Network Optimization

## Reduce Latency
1. Use connection keep-alive
2. Enable TCP nodelay
3. Optimize RabbitMQ prefetch count
4. Use persistent connections

## Bandwidth Optimization
1. Enable compression for HTTP responses
2. Batch API requests where possible
3. Cache responses client-side
4. Use pagination for large result sets

# Security Hardening

## For Production
1. Enable HTTPS/TLS
2. Implement authentication/authorization
3. Use environment variables for secrets
4. Enable database authentication
5. Use network policies to restrict access
6. Regular security audits

# Logging & Observability

## Structured Logging
```javascript
console.log(JSON.stringify({
  timestamp: new Date().toISOString(),
  level: 'INFO',
  service: 'backend',
  event: 'incident_created',
  incidentId: incident._id,
  duration: processingTime
}));
```

## Distributed Tracing
```javascript
// Add correlation IDs to requests
const correlationId = req.headers['x-correlation-id'] || generateUUID();
res.setHeader('x-correlation-id', correlationId);
```

# Troubleshooting Performance Issues

## High CPU Usage
- Check signal processing time
- Profile with: `node --prof index.js`
- Identify hot functions and optimize

## High Memory Usage
- Check for memory leaks: `node --expose-gc index.js`
- Reduce cache size
- Monitor with: `ps aux | grep node`

## Database Bottleneck
- Check active connections
- Analyze slow queries: `EXPLAIN ANALYZE`
- Add missing indexes
- Increase pool size

## Queue Backlog
- Monitor with: `GET /metrics/json`
- Increase worker count
- Reduce batch processing time
- Check worker logs for errors

---

Last Updated: 2024
Version: 1.0
