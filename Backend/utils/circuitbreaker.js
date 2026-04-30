/**
 * Circuit Breaker Pattern for Resilience
 * Prevents cascading failures
 */

class CircuitBreaker {
  constructor(config = {}) {
    this.failureThreshold = config.failureThreshold || 5;
    this.successThreshold = config.successThreshold || 2;
    this.timeout = config.timeout || 60000; // 1 minute
    this.state = "CLOSED"; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttemptAt = Date.now();
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute(fn) {
    if (this.state === "OPEN") {
      if (Date.now() < this.nextAttemptAt) {
        throw new Error(
          `Circuit breaker is OPEN. Retry after ${Math.ceil((this.nextAttemptAt - Date.now()) / 1000)}s`
        );
      }

      // Try to half-open
      this.state = "HALF_OPEN";
      this.successCount = 0;
    }

    try {
      const result = await fn();

      if (this.state === "HALF_OPEN") {
        this.successCount++;

        if (this.successCount >= this.successThreshold) {
          this.state = "CLOSED";
          this.failureCount = 0;
          this.successCount = 0;
          console.log("✅ Circuit breaker CLOSED");
        }
      }

      return result;
    } catch (error) {
      this.failureCount++;

      if (this.failureCount >= this.failureThreshold) {
        this.state = "OPEN";
        this.nextAttemptAt = Date.now() + this.timeout;
        console.error("🔴 Circuit breaker OPEN");
      }

      throw error;
    }
  }

  /**
   * Get circuit state
   */
  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      failureThreshold: this.failureThreshold,
      successThreshold: this.successThreshold,
    };
  }

  /**
   * Reset circuit
   */
  reset() {
    this.state = "CLOSED";
    this.failureCount = 0;
    this.successCount = 0;
    console.log("🔄 Circuit breaker reset");
  }
}

module.exports = { CircuitBreaker };
