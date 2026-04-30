/**
 * Worker Process
 * Consumes signals from RabbitMQ queue and creates incidents
 */

const amqp = require("amqplib");
const { initMongoDB, getMongoDB, getRedis } = require("./utils/database");
const { retryWithBackoff } = require("./utils/retry");
const { metricsCollector } = require("./utils/metrics");
const { AlertService } = require("./utils/alerts");
const Incident = require("./models/incident");
const Signal = require("./models/signal");

let channel;
let connection;
const alertService = new AlertService();

// ============ Database Initialization ============

async function initializeForWorker() {
  try {
    await initMongoDB();
    console.log("✅ Worker database initialized");
  } catch (err) {
    console.error("❌ Worker initialization failed:", err.message);
    process.exit(1);
  }
}

// ============ RabbitMQ Connection ============

async function connectRabbitMQ() {
  while (true) {
    try {
      const rabbitmqUrl = process.env.RABBITMQ_URL || "amqp://localhost";
      connection = await amqp.connect(rabbitmqUrl);
      channel = await connection.createChannel();
      await channel.assertQueue("signals", { durable: true });
      await channel.assertQueue("incidents", { durable: true });

      channel.on("error", (err) => {
        console.error("❌ RabbitMQ channel error:", err);
      });

      connection.on("error", (err) => {
        console.error("❌ RabbitMQ connection error:", err);
        setTimeout(connectRabbitMQ, 5000);
      });

      console.log("✅ Worker connected to RabbitMQ");
      break;
    } catch (err) {
      console.log("❌ RabbitMQ not ready for worker, retrying in 5s...");
      await new Promise((res) => setTimeout(res, 5000));
    }
  }
}

// ============ Signal Processing ============

async function processSignal(signal) {
  const startTime = Date.now();

  try {
    console.log(`🔄 Processing signal: ${signal.type} from ${signal.source}`);

    // Determine severity level
    const severityMap = {
      error: "high",
      exception: "critical",
      warning: "medium",
      info: "low",
    };

    const severity = severityMap[signal.type] || signal.severity || "medium";

    // Check if incident already exists for this source/type within last 10 minutes
    const existingIncident = await Incident.findOne({
      source: signal.source,
      status: { $in: ["open", "investigating"] },
      "timeline.openedAt": {
        $gt: new Date(Date.now() - 10 * 60 * 1000), // last 10 minutes
      },
    });

    let incident;

    if (existingIncident) {
      // Add signal to existing incident
      console.log(`🔗 Adding to existing incident: ${existingIncident._id}`);
      existingIncident.signals.push(signal.signalId);
      incident = await existingIncident.save();
    } else {
      // Create new incident
      console.log(`✨ Creating new incident for signal`);

      incident = await retryWithBackoff(
        async () => {
          const newIncident = new Incident({
            description: signal.description || `Signal from ${signal.source}`,
            severity,
            source: signal.source,
            signals: [signal.signalId],
            status: "open",
            timeline: {
              openedAt: new Date(),
            },
            tags: [signal.type, signal.source],
          });

          return await newIncident.save();
        },
        3, // max attempts
        1000, // initial delay
        2, // backoff multiplier
        (retry) => {
          console.log(
            `⚠️ Incident creation retry ${retry.attempt}: ${retry.error}`
          );
        }
      );

      metricsCollector.recordIncident(severity);
      metricsCollector.recordDbWrite(true);

      // Send critical alert if severity is high or critical
      if (severity === "critical" || severity === "high") {
        await alertService.alertCritical(incident);
      }
    }

    // Update signal as processed
    await Signal.findByIdAndUpdate(signal.signalId, {
      processed: true,
      incident: incident._id,
      processingTime: Date.now() - startTime,
    });

    // Queue incident for further processing
    await channel.sendToQueue(
      "incidents",
      Buffer.from(
        JSON.stringify({
          incidentId: incident._id,
          timestamp: new Date().toISOString(),
        })
      ),
      { persistent: true }
    );

    console.log(`✅ Signal processed successfully in ${Date.now() - startTime}ms`);
    metricsCollector.recordProcessingTime(Date.now() - startTime);

    return true;
  } catch (error) {
    console.error("❌ Error processing signal:", error.message);
    metricsCollector.recordDbWrite(false);
    return false;
  }
}

// ============ Message Consumer ============

async function startConsumer() {
  await channel.prefetch(1); // Process one message at a time

  await channel.consume("signals", async (msg) => {
    if (msg) {
      try {
        const signal = JSON.parse(msg.content.toString());
        const success = await processSignal(signal);

        if (success) {
          channel.ack(msg);
        } else {
          // Requeue on failure
          channel.nack(msg, false, true);
        }
      } catch (error) {
        console.error("❌ Message parsing/processing error:", error.message);
        channel.nack(msg, false, false); // Reject without requeue
      }
    }
  });

  console.log("🎵 Listening for signals...");
}

// ============ Worker Startup ============

async function startWorker() {
  try {
    await initializeForWorker();
    await connectRabbitMQ();
    await startConsumer();
  } catch (err) {
    console.error("❌ Worker startup failed:", err.message);
    process.exit(1);
  }
}

// ============ Graceful Shutdown ============

process.on("SIGTERM", async () => {
  console.log("SIGTERM received, worker shutting down gracefully...");
  if (channel) await channel.close();
  if (connection) await connection.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, worker shutting down gracefully...");
  if (channel) await channel.close();
  if (connection) await connection.close();
  process.exit(0);
});

// Start the worker
startWorker().catch((err) => {
  console.error("Failed to start worker:", err);
  process.exit(1);
});

module.exports = { processSignal };