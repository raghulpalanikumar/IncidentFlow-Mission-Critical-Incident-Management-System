/**
 * Jest Setup
 */

// Mock environment variables for tests
process.env.POSTGRES_USER = "test";
process.env.POSTGRES_PASSWORD = "test";
process.env.POSTGRES_DB = "ims_test";
process.env.MONGODB_URL = "mongodb://localhost:27017/ims_test";
