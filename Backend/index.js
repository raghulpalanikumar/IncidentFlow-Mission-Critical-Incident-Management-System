const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const amqp = require("amqplib");
const rateLimit = require("express-rate-limit");
const { client: promClient } = require("prom-client");

const {
  initPostgres,
  initMongoDB,
  initRedis,
  getPostgres,
  getMongoDB,
  getRedis,
  closeAll,
} = require("./utils/database");
const { retryWithBackoff } = require("./utils/retry");
const { metricsCollector } = require("./utils/metrics");
const { AlertService } = require("./utils/alerts");
const { DebounceManager } = require("./utils/debounce");
const Incident = require("./models/incident");
const Signal = require("./models/signal");

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
});

app.use(limiter);

// Global variables
let channel;
let connection;
const alertService = new AlertService();
const debounceManager = new DebounceManager(5000); // 5 second window

// ============ Database Initialization ============

async function initializeDatabases() {
  try {
    await initPostgres();
    await initMongoDB();
    await initRedis();
    console.log("✅ All databases initialized");
  } catch (err) {
    console.error("❌ Database initialization failed:", err.message);
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

      console.log("✅ Connected to RabbitMQ");
      break;
    } catch (err) {
      console.log("❌ RabbitMQ not ready, retrying in 5s...");
      await new Promise((res) => setTimeout(res, 5000));
    }
  }
}

// ============ Health Check Endpoint ============

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    databases: {
      postgres: "connected",
      mongodb: "connected",
      redis: "connected",
      rabbitmq: channel ? "connected" : "disconnected",
    },
  });
});

// ============ Metrics Endpoints ============

app.get("/metrics", (req, res) => {
  res.set("Content-Type", promClient.register.contentType);
  res.end(metricsCollector.getMetrics());
});

app.get("/metrics/json", (req, res) => {
  res.json({
    metrics: metricsCollector.getMetricsJson(),
    debounceState: debounceManager.getState(),
  });
});

function withTimeout(promise, timeoutMs, errorMessage) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

// ============ Signals Endpoint ============

app.post("/signals", async (req, res) => {
  const startTime = Date.now();
  console.log("🔔 /signals received", { path: req.path, method: req.method });

  if (!channel) {
    metricsCollector.recordSignal("error");
    return res.status(500).json({ error: "Queue not ready" });
  }

  try {
    const signal = req.body;
    console.log("📥 Signal payload", signal);

    // Validate signal
    if (!signal.type || !signal.source) {
      metricsCollector.recordSignal("invalid");
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Check for duplicates (debouncing)
    if (debounceManager.isDuplicate(signal)) {
      metricsCollector.recordSignal("duplicate");
      console.log("⏭️ Signal debounced (duplicate)");
      return res.status(202).json({ message: "Signal debounced" });
    }

    // Store signal in MongoDB with a safety timeout
    const savedSignal = await withTimeout(
      retryWithBackoff(
        async () => {
          const newSignal = new Signal({
            type: signal.type,
            source: signal.source,
            severity: signal.severity || "medium",
            description: signal.description,
            metadata: signal.metadata || {},
          });
          return await newSignal.save();
        },
        3, // max attempts
        1000, // initial delay
        2, // backoff multiplier
        (retry) => console.log(`⚠️ Signal save retry ${retry.attempt}`)
      ),
      10000,
      "Signal save timed out"
    );

    metricsCollector.recordSignal("stored");
    metricsCollector.recordDbWrite(true);

    // Queue for processing
    const queued = channel.sendToQueue(
      "signals",
      Buffer.from(
        JSON.stringify({
          ...signal,
          signalId: savedSignal._id,
          queuedAt: new Date().toISOString(),
        })
      ),
      { persistent: true }
    );

    if (!queued) {
      throw new Error("Failed to queue signal for processing");
    }

    metricsCollector.recordSignal("queued");

    const processingTime = Date.now() - startTime;
    metricsCollector.recordProcessingTime(processingTime);

    res.json({
      message: "Signal queued for processing",
      signalId: savedSignal._id,
      processingTimeMs: processingTime,
    });
  } catch (error) {
    console.error("❌ Signal processing failed:", error.message);
    metricsCollector.recordSignal("error");
    metricsCollector.recordDbWrite(false);

    res.status(500).json({
      error: "Failed to process signal",
      details: error.message,
    });
  }
});

// ============ Incidents Endpoints ============

app.get("/incidents", async (req, res) => {
  try {
    const filter = {
      status: req.query.status || { $ne: "closed" },
    };

    const incidents = await Incident.find(filter)
      .populate("signals")
      .sort({ "timeline.openedAt": -1 })
      .limit(50);

    res.json(incidents);
  } catch (error) {
    console.error("❌ Failed to fetch incidents:", error.message);
    res.status(500).json({ error: "Failed to fetch incidents" });
  }
});

app.get("/incidents/:id", async (req, res) => {
  try {
    const incident = await Incident.findById(req.params.id).populate("signals");

    if (!incident) {
      return res.status(404).json({ error: "Incident not found" });
    }

    res.json(incident);
  } catch (error) {
    console.error("❌ Failed to fetch incident:", error.message);
    res.status(500).json({ error: "Failed to fetch incident" });
  }
});

app.post("/incidents/:id/resolve", async (req, res) => {
  try {
    const incident = await Incident.findById(req.params.id);

    if (!incident) {
      return res.status(404).json({ error: "Incident not found" });
    }

    incident.status = "resolved";
    incident.timeline.resolvedAt = new Date();
    const updatedIncident = await incident.save();

    metricsCollector.recordIncident(incident.severity);
    if (incident.metrics.mttr) {
      metricsCollector.recordMTTR(incident.metrics.mttr);
    }

    // Send resolution alert
    await alertService.alertResolved(incident, incident.metrics.mttr || 0);

    res.json(updatedIncident);
  } catch (error) {
    console.error("❌ Failed to resolve incident:", error.message);
    res.status(500).json({ error: "Failed to resolve incident" });
  }
});

app.post("/incidents/:id/rca", async (req, res) => {
  try {
    const { description, rootCause, actionItems } = req.body;

    const incident = await Incident.findById(req.params.id);

    if (!incident) {
      return res.status(404).json({ error: "Incident not found" });
    }

    incident.rca = {
      description,
      rootCause,
      actionItems: Array.isArray(actionItems) ? actionItems : [],
      validatedAt: new Date(),
    };

    const updatedIncident = await incident.save();
    res.json(updatedIncident);
  } catch (error) {
    console.error("❌ Failed to save RCA:", error.message);
    res.status(500).json({ error: "Failed to save RCA" });
  }
});

// ============ Server Startup ============

async function startServer() {
  try {
    // Initialize databases
    await initializeDatabases();

    // Connect to RabbitMQ
    await connectRabbitMQ();

    // Start Express server
    app.listen(PORT, () => {
      console.log(`✅ Backend server running on port ${PORT}`);
    });

    // Cleanup debounce manager periodically
    setInterval(() => {
      debounceManager.cleanup();
    }, 30000); // every 30 seconds
  } catch (err) {
    console.error("❌ Server startup failed:", err.message);
    process.exit(1);
  }
}

// ============ Graceful Shutdown ============

process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully...");
  if (connection) await connection.close();
  await closeAll();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, shutting down gracefully...");
  if (connection) await connection.close();
  await closeAll();
  process.exit(0);
});

// Start the server
startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

module.exports = app;