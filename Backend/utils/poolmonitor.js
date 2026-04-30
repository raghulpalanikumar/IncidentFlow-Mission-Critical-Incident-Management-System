/**
 * Connection Pool Monitor
 * Tracks connection health and performance
 */

class PoolMonitor {
  constructor(pool, name = "pool") {
    this.pool = pool;
    this.name = name;
    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      waitingRequests: 0,
      avgWaitTime: 0,
      errors: 0,
    };
    this.startMonitoring();
  }

  /**
   * Start monitoring pool health
   */
  startMonitoring() {
    setInterval(() => {
      this._updateStats();
    }, 5000); // Every 5 seconds
  }

  /**
   * Update pool statistics
   */
  _updateStats() {
    if (this.pool._clients) {
      this.stats.totalConnections = this.pool._clients.length;
      this.stats.activeConnections =
        this.pool._clients.filter((c) => !c._idle).length || 0;
      this.stats.idleConnections = this.stats.totalConnections - this.stats.activeConnections;
    }

    if (this.pool.waitingCount !== undefined) {
      this.stats.waitingRequests = this.pool.waitingCount;
    }

    if (this.stats.totalConnections > 0) {
      const utilization = (this.stats.activeConnections / this.stats.totalConnections) * 100;

      if (utilization > 80) {
        console.warn(
          `⚠️ ${this.name} pool utilization high: ${utilization.toFixed(2)}%`
        );
      }
    }
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Get pool health status
   */
  getHealth() {
    const utilization =
      this.stats.totalConnections > 0
        ? (this.stats.activeConnections / this.stats.totalConnections) * 100
        : 0;

    return {
      name: this.name,
      status: utilization > 90 ? "CRITICAL" : utilization > 70 ? "DEGRADED" : "HEALTHY",
      utilization: utilization.toFixed(2) + "%",
      ...this.getStats(),
    };
  }
}

module.exports = { PoolMonitor };
