/**
 * Metrics Tracking Service
 * Tracks: total signals, incidents created, MTTR average
 */

const client = require("prom-client");

// Create metrics
const totalSignals = new client.Counter({
  name: "ims_total_signals",
  help: "Total number of signals received",
  labelNames: ["status"],
});

const incidentsCreated = new client.Counter({
  name: "ims_incidents_created",
  help: "Total number of incidents created",
  labelNames: ["severity"],
});

const mttrDuration = new client.Histogram({
  name: "ims_mttr_seconds",
  help: "Mean Time To Resolution in seconds",
  buckets: [60, 300, 900, 1800, 3600, 7200], // 1m, 5m, 15m, 30m, 1h, 2h
});

const dbWriteAttempts = new client.Counter({
  name: "ims_db_write_attempts",
  help: "Database write attempts",
  labelNames: ["status"], // success, failure
});

const queueDepth = new client.Gauge({
  name: "ims_queue_depth",
  help: "Current queue depth",
});

const processingTime = new client.Histogram({
  name: "ims_signal_processing_time_ms",
  help: "Signal processing time in milliseconds",
  buckets: [10, 50, 100, 500, 1000, 5000],
});

class MetricsCollector {
  recordSignal(status = "received") {
    totalSignals.labels(status).inc();
  }

  recordIncident(severity = "medium") {
    incidentsCreated.labels(severity).inc();
  }

  recordMTTR(seconds) {
    mttrDuration.observe(seconds);
  }

  recordDbWrite(success = true) {
    dbWriteAttempts.labels(success ? "success" : "failure").inc();
  }

  setQueueDepth(depth) {
    queueDepth.set(depth);
  }

  recordProcessingTime(milliseconds) {
    processingTime.observe(milliseconds);
  }

  getMetrics() {
    return client.register.metrics();
  }

  getMetricsJson() {
    const metrics = {};
    const lines = client.register.metrics().split("\n");

    lines.forEach((line) => {
      if (line.startsWith("ims_")) {
        const [key, value] = line.split(" ");
        metrics[key] = parseFloat(value) || value;
      }
    });

    return metrics;
  }
}

module.exports = {
  metricsCollector: new MetricsCollector(),
  MetricsCollector,
  client,
};
