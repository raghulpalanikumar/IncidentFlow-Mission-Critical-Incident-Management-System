/**
 * Database connection utilities
 * Handles PostgreSQL and MongoDB connections with pooling
 */

const { Pool } = require("pg");
const mongoose = require("mongoose");
const redis = require("redis");

let pgPool;
let mongoConnection;
let redisClient;

/**
 * Initialize PostgreSQL connection pool
 */
async function initPostgres(config = {}) {
  pgPool = new Pool({
    user: config.user || process.env.POSTGRES_USER || "user",
    password: config.password || process.env.POSTGRES_PASSWORD || "pass",
    host: config.host || process.env.POSTGRES_HOST || "localhost",
    port: config.port || process.env.POSTGRES_PORT || 5432,
    database: config.database || process.env.POSTGRES_DB || "ims",
    max: config.maxConnections || 20,
    idleTimeoutMillis: config.idleTimeout || 30000,
    connectionTimeoutMillis: config.connectionTimeout || 5000,
  });

  pgPool.on("error", (err) => {
    console.error("❌ Unexpected error on idle PostgreSQL client:", err);
  });

  try {
    const client = await pgPool.connect();
    client.release();
    console.log("✅ PostgreSQL connected");
    return pgPool;
  } catch (err) {
    console.error("❌ PostgreSQL connection failed:", err.message);
    throw err;
  }
}

/**
 * Initialize MongoDB connection
 */
async function initMongoDB(config = {}) {
  const mongoUrl =
    config.url ||
    process.env.MONGODB_URL ||
    "mongodb://localhost:27017/ims";

  try {
    await mongoose.connect(mongoUrl, {
      maxPoolSize: config.maxPoolSize || 10,
      minPoolSize: config.minPoolSize || 2,
    });

    mongoConnection = mongoose.connection;
    console.log("✅ MongoDB connected");
    return mongoConnection;
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    throw err;
  }
}

/**
 * Initialize Redis connection
 */
async function initRedis(config = {}) {
  const host = config.host || process.env.REDIS_HOST || "localhost";
  const port = config.port || process.env.REDIS_PORT || 6379;

  redisClient = redis.createClient({
    url: `redis://${host}:${port}`,
    socket: {
      reconnectStrategy: (retries) => Math.min(1000 * 2 ** retries, 30_000),
    },
  });

  redisClient.on("error", (err) => {
    console.error("❌ Redis error:", err);
  });

  try {
    await redisClient.connect();
    console.log("✅ Redis connected");
    return redisClient;
  } catch (err) {
    console.error("❌ Redis connection failed:", err.message);
    throw err;
  }
}

/**
 * Get PostgreSQL pool
 */
function getPostgres() {
  if (!pgPool) {
    throw new Error("PostgreSQL not initialized");
  }
  return pgPool;
}

/**
 * Get MongoDB connection
 */
function getMongoDB() {
  if (!mongoConnection) {
    throw new Error("MongoDB not initialized");
  }
  return mongoConnection;
}

/**
 * Get Redis client
 */
function getRedis() {
  if (!redisClient) {
    throw new Error("Redis not initialized");
  }
  return redisClient;
}

/**
 * Close all connections
 */
async function closeAll() {
  if (pgPool) {
    await pgPool.end();
  }
  if (mongoConnection) {
    await mongoose.connection.close();
  }
  if (redisClient) {
    await redisClient.quit();
  }
}

module.exports = {
  initPostgres,
  initMongoDB,
  initRedis,
  getPostgres,
  getMongoDB,
  getRedis,
  closeAll,
};
