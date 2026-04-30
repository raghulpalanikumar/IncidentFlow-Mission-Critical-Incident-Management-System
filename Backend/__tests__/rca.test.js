/**
 * Unit Tests for RCA Validation
 */

const Incident = require("../models/incident");

describe("RCA Validation", () => {
  let incident;

  beforeEach(() => {
    incident = new Incident({
      description: "Test incident",
      severity: "high",
      source: "test-source",
      status: "open",
    });
  });

  describe("validateRCA()", () => {
    test("should return false when RCA is not defined", () => {
      expect(incident.validateRCA()).toBe(false);
    });

    test("should return false when RCA is empty object", () => {
      incident.rca = {};
      expect(incident.validateRCA()).toBe(false);
    });

    test("should return false when RCA missing description", () => {
      incident.rca = {
        rootCause: "Database timeout",
        actionItems: ["Scale DB", "Optimize queries"],
      };
      expect(incident.validateRCA()).toBe(false);
    });

    test("should return false when RCA missing rootCause", () => {
      incident.rca = {
        description: "High database query time",
        actionItems: ["Scale DB"],
      };
      expect(incident.validateRCA()).toBe(false);
    });

    test("should return false when RCA missing actionItems", () => {
      incident.rca = {
        description: "High database query time",
        rootCause: "Database timeout",
      };
      expect(incident.validateRCA()).toBe(false);
    });

    test("should return false when actionItems is empty", () => {
      incident.rca = {
        description: "High database query time",
        rootCause: "Database timeout",
        actionItems: [],
      };
      expect(incident.validateRCA()).toBe(false);
    });

    test("should return true when all RCA fields are present and valid", () => {
      incident.rca = {
        description: "High database query time due to missing indexes",
        rootCause: "Database timeout on queries without indexes",
        actionItems: [
          "Add indexes to frequently queried columns",
          "Optimize slow queries",
          "Implement query caching",
        ],
        validatedAt: new Date(),
      };
      expect(incident.validateRCA()).toBe(true);
    });

    test("should return true with single action item", () => {
      incident.rca = {
        description: "API rate limit exceeded",
        rootCause: "Insufficient rate limiting",
        actionItems: ["Implement exponential backoff in clients"],
        validatedAt: new Date(),
      };
      expect(incident.validateRCA()).toBe(true);
    });

    test("should return true with multiple action items", () => {
      incident.rca = {
        description: "Memory leak in worker process",
        rootCause: "Unbounded cache growth",
        actionItems: [
          "Implement LRU cache eviction",
          "Add memory monitoring",
          "Set max cache size limits",
          "Monitor in production",
        ],
      };
      expect(incident.validateRCA()).toBe(true);
    });
  });

  describe("RCA Completeness", () => {
    test("should accept RCA with all required fields and extra metadata", () => {
      incident.rca = {
        description: "Service outage due to deployment issue",
        rootCause: "Broken database migration in v2.0",
        actionItems: [
          "Implement pre-deployment validation",
          "Add rollback capability",
          "Improve monitoring",
        ],
        validatedAt: new Date(),
        investigatedBy: "team@example.com",
        severity: "critical",
      };
      expect(incident.validateRCA()).toBe(true);
    });

    test("should validate RCA regardless of case sensitivity", () => {
      incident.rca = {
        description: "Test description",
        rootCause: "Test root cause",
        actionItems: ["Action 1"],
      };
      expect(incident.validateRCA()).toBe(true);
    });
  });

  describe("MTTR Calculation", () => {
    test("should calculate MTTR correctly", async () => {
      incident.timeline.openedAt = new Date(Date.now() - 3600000); // 1 hour ago
      incident.timeline.resolvedAt = new Date();

      incident.save = jest.fn().mockResolvedValue(incident);

      await incident.save();

      // MTTR should be approximately 3600 seconds
      expect(incident.metrics.mttr).toBeGreaterThan(3599);
      expect(incident.metrics.mttr).toBeLessThan(3601);
    });

    test("should not calculate MTTR without resolved time", () => {
      incident.timeline.openedAt = new Date(Date.now() - 3600000);
      incident.timeline.resolvedAt = undefined;

      expect(incident.metrics.mttr).toBeUndefined();
    });

    test("should not calculate MTTR without opened time", () => {
      incident.timeline.openedAt = undefined;
      incident.timeline.resolvedAt = new Date();

      expect(incident.metrics.mttr).toBeUndefined();
    });
  });
});
