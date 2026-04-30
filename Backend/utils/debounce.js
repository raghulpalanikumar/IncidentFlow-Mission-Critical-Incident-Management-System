/**
 * Debounce utility for signal grouping
 * Prevents duplicate incidents from similar signals within a time window
 */

class DebounceManager {
  constructor(windowMs = 5000) {
    this.windowMs = windowMs;
    this.signalMap = new Map();
  }

  /**
   * Check if signal should be processed (debounced)
   * Returns true if signal is unique or outside window, false if should be skipped
   */
  shouldProcess(signalKey, currentTime = Date.now()) {
    const lastTime = this.signalMap.get(signalKey);

    if (!lastTime || currentTime - lastTime >= this.windowMs) {
      this.signalMap.set(signalKey, currentTime);
      return true;
    }

    return false;
  }

  /**
   * Generate signal key from signal data
   */
  generateKey(signal) {
    return `${signal.source}:${signal.type}:${signal.severity}`;
  }

  /**
   * Check if this is a duplicate signal
   */
  isDuplicate(signal, currentTime = Date.now()) {
    const key = this.generateKey(signal);
    return !this.shouldProcess(key, currentTime);
  }

  /**
   * Clear old entries (cleanup)
   */
  cleanup(currentTime = Date.now()) {
    for (const [key, time] of this.signalMap.entries()) {
      if (currentTime - time >= this.windowMs * 2) {
        this.signalMap.delete(key);
      }
    }
  }

  /**
   * Clear all entries
   */
  reset() {
    this.signalMap.clear();
  }

  /**
   * Get current state (for debugging)
   */
  getState() {
    return {
      windowMs: this.windowMs,
      activeSignals: this.signalMap.size,
      signals: Array.from(this.signalMap.entries()).map(([key, time]) => ({
        key,
        lastSeenAt: new Date(time).toISOString(),
      })),
    };
  }
}

module.exports = { DebounceManager };
