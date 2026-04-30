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
const debounceManager = new DebounceManager(10000); // 10 second window

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

    // Generate an ID without saving to DB synchronously (to handle 10k burst)
    const mongoose = require("mongoose");
    const signalId = new mongoose.Types.ObjectId();

    // Check for duplicates (debouncing) - we just mark it, but still process it
    const isDuplicate = debounceManager.isDuplicate(signal);
    if (isDuplicate) {
      metricsCollector.recordSignal("duplicate");
    }

    // Queue for processing
    const queued = channel.sendToQueue(
      "signals",
      Buffer.from(
        JSON.stringify({
          ...signal,
          signalId: signalId,
          isDuplicate: isDuplicate,
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
      message: isDuplicate ? "Signal debounced but queued" : "Signal queued for processing",
      signalId: signalId,
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
    const statusQuery = req.query.status || "active";
    const cacheKey = `dashboard_state:${statusQuery}`;
    const { getRedis } = require("./utils/database");
    
    try {
      const redisClient = getRedis();
      if (redisClient && redisClient.isReady) {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          return res.json(JSON.parse(cached));
        }
      }
    } catch(err) { /* ignore cache error */ }

    const filter = {};
    if (statusQuery === "active") {
      filter.status = { $ne: "closed" };
    } else if (statusQuery !== "all") {
      filter.status = statusQuery;
    }

    const incidents = await Incident.find(filter)
      .populate("signals")
      .sort({ "timeline.openedAt": -1 })
      .limit(50);

    try {
      const redisClient = getRedis();
      if (redisClient && redisClient.isReady) {
        await redisClient.setEx(cacheKey, 10, JSON.stringify(incidents)); // Cache for 10s
      }
    } catch(err) { /* ignore cache error */ }

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

app.post("/incidents/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const incident = await Incident.findById(req.params.id);

    if (!incident) {
      return res.status(404).json({ error: "Incident not found" });
    }

    const { initializeState } = require("./utils/incidentStates");
    
    // Initialize current state and transition to new status
    incident.state = initializeState(incident);
    incident.state.next(status);

    const updatedIncident = await incident.save();

    if (status === "resolved") {
      metricsCollector.recordIncident(incident.severity);
      if (incident.metrics && incident.metrics.mttr) {
        metricsCollector.recordMTTR(incident.metrics.mttr);
      }
      // Send resolution alert
      await alertService.alertResolved(incident, incident.metrics ? incident.metrics.mttr : 0);
    }

    res.json(updatedIncident);
  } catch (error) {
    console.error("❌ Failed to change incident status:", error.message);
    res.status(400).json({ error: error.message });
  }
});

app.post("/incidents/:id/rca", async (req, res) => {
  try {
    const { startAt, endAt, description, rootCause, actionItems } = req.body;

    const incident = await Incident.findById(req.params.id);

    if (!incident) {
      return res.status(404).json({ error: "Incident not found" });
    }

    const rcaTime = new Date();
    incident.rca = {
      startAt: startAt ? new Date(startAt) : null,
      endAt: endAt ? new Date(endAt) : null,
      description,
      rootCause,
      actionItems: Array.isArray(actionItems) ? actionItems : [],
      validatedAt: rcaTime,
    };

    // Automatically calculate MTTR based on start time and RCA submission time
    if (incident.timeline.openedAt) {
      const mttr = (rcaTime - incident.timeline.openedAt) / 1000;
      if (!incident.metrics) incident.metrics = {};
      incident.metrics.mttr = mttr;
      metricsCollector.recordMTTR(mttr);
    }

    // The system automatically attempts to close the incident upon valid RCA submission
    const { initializeState } = require("./utils/incidentStates");
    incident.state = initializeState(incident);
    
    // Move to resolved first if not already
    if (incident.status === 'open' || incident.status === 'investigating') {
      incident.state.next('resolved');
    }
    // Then attempt to close it
    incident.state.next('closed');

    const updatedIncident = await incident.save();
    res.json(updatedIncident);
  } catch (error) {
    console.error("❌ Failed to save RCA:", error.message);
    res.status(400).json({ error: error.message });
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

    // Observability: Print throughput metrics every 5 seconds
    let lastTotalSignals = 0;
    setInterval(() => {
      try {
        const metrics = metricsCollector.getMetricsJson();
        const total = metrics.ims_total_signals || 0;
        const throughput = (total - lastTotalSignals) / 5;
        console.log(`[Observability] Throughput: ${throughput} signals/sec`);
        lastTotalSignals = total;
      } catch (err) {}
    }, 5000);
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