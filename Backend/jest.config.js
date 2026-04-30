/**
 * Jest Configuration
 */

module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>"],
  testMatch: ["**/__tests__/**/*.test.js"],
  collectCoverageFrom: [
    "utils/**/*.js",
    "models/**/*.js",
    "!node_modules/**",
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  setupFilesAfterEnv: ["<rootDir>/__tests__/setup.js"],
  testTimeout: 30000,
};
