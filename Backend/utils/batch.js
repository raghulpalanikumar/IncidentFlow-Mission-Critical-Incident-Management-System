/**
 * Batch Processing for Burst Traffic
 * Groups signals for efficient batch processing
 */

class BatchProcessor {
  constructor(config = {}) {
    this.batchSize = config.batchSize || 50;
    this.flushIntervalMs = config.flushIntervalMs || 5000;
    this.batches = new Map();
    this.timers = new Map();
    this.stats = {
      signalsProcessed: 0,
      batchesProcessed: 0,
      avgBatchSize: 0,
    };
  }

  /**
   * Add item to batch
   */
  async addToBatch(batchKey, item, processor) {
    if (!this.batches.has(batchKey)) {
      this.batches.set(batchKey, []);

      // Set auto-flush timer
      const timer = setTimeout(() => {
        this._flushBatch(batchKey, processor);
      }, this.flushIntervalMs);

      this.timers.set(batchKey, timer);
    }

    const batch = this.batches.get(batchKey);
    batch.push(item);

    // Flush if batch is full
    if (batch.length >= this.batchSize) {
      clearTimeout(this.timers.get(batchKey));
      return await this._flushBatch(batchKey, processor);
    }

    return null;
  }

  /**
   * Flush batch
   */
  async _flushBatch(batchKey, processor) {
    const batch = this.batches.get(batchKey);

    if (!batch || batch.length === 0) {
      return null;
    }

    this.batches.delete(batchKey);

    const timer = this.timers.get(batchKey);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(batchKey);
    }

    try {
      const results = await processor(batch);

      this.stats.signalsProcessed += batch.length;
      this.stats.batchesProcessed++;
      this.stats.avgBatchSize =
        this.stats.signalsProcessed / this.stats.batchesProcessed;

      console.log(`✅ Processed batch of ${batch.length} items`);

      return results;
    } catch (err) {
      console.error("❌ Batch processing failed:", err.message);
      // Re-queue failed items
      batch.forEach((item) => {
        this.batches.set(batchKey, [item]);
      });
      throw err;
    }
  }

  /**
   * Manually flush all batches
   */
  async flushAll(processor) {
    const promises = [];

    for (const [batchKey] of this.batches) {
      promises.push(this._flushBatch(batchKey, processor));
    }

    return await Promise.all(promises);
  }

  /**
   * Get batch statistics
   */
  getStats() {
    return {
      ...this.stats,
      pendingBatches: this.batches.size,
      pendingItems: Array.from(this.batches.values()).reduce(
        (sum, batch) => sum + batch.length,
        0
      ),
    };
  }
}

module.exports = { BatchProcessor };
