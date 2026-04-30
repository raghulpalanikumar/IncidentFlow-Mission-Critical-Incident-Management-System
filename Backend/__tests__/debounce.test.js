/**
 * Unit Tests for Debounce Logic
 */

const { DebounceManager } = require("../utils/debounce");

describe("DebounceManager", () => {
  let debounce;

  beforeEach(() => {
    debounce = new DebounceManager(5000); // 5 second window
  });

  describe("Initialization", () => {
    test("should initialize with default window", () => {
      const defaultDebounce = new DebounceManager();
      expect(defaultDebounce.windowMs).toBe(5000);
    });

    test("should initialize with custom window", () => {
      const customDebounce = new DebounceManager(10000);
      expect(customDebounce.windowMs).toBe(10000);
    });

    test("should have empty signal map on init", () => {
      expect(debounce.signalMap.size).toBe(0);
    });
  });

  describe("shouldProcess()", () => {
    test("should return true for new signal key", () => {
      const result = debounce.shouldProcess("source1:error:high");
      expect(result).toBe(true);
    });

    test("should return false for duplicate signal within window", () => {
      const signalKey = "source1:error:high";
      const currentTime = Date.now();

      debounce.shouldProcess(signalKey, currentTime);
      const result = debounce.shouldProcess(signalKey, currentTime + 1000);

      expect(result).toBe(false);
    });

    test("should return true for signal outside window", () => {
      const signalKey = "source1:error:high";
      const startTime = Date.now();

      debounce.shouldProcess(signalKey, startTime);
      const result = debounce.shouldProcess(signalKey, startTime + 6000); // 6s later

      expect(result).toBe(true);
    });

    test("should track multiple different signals", () => {
      debounce.shouldProcess("signal1", Date.now());
      debounce.shouldProcess("signal2", Date.now());
      debounce.shouldProcess("signal3", Date.now());

      expect(debounce.signalMap.size).toBe(3);
    });

    test("should handle exact window boundary", () => {
      const signalKey = "source1:error:high";
      const currentTime = Date.now();

      debounce.shouldProcess(signalKey, currentTime);
      const result = debounce.shouldProcess(signalKey, currentTime + 5000);

      expect(result).toBe(true); // Exact boundary should be processed
    });
  });

  describe("generateKey()", () => {
    test("should generate key from signal object", () => {
      const signal = {
        source: "api-server",
        type: "error",
        severity: "high",
      };

      const key = debounce.generateKey(signal);
      expect(key).toBe("api-server:error:high");
    });

    test("should generate consistent keys for same signal", () => {
      const signal = {
        source: "db",
        type: "timeout",
        severity: "critical",
      };

      const key1 = debounce.generateKey(signal);
      const key2 = debounce.generateKey(signal);

      expect(key1).toBe(key2);
    });

    test("should generate different keys for different sources", () => {
      const signal1 = { source: "api", type: "error", severity: "high" };
      const signal2 = { source: "db", type: "error", severity: "high" };

      const key1 = debounce.generateKey(signal1);
      const key2 = debounce.generateKey(signal2);

      expect(key1).not.toBe(key2);
    });
  });

  describe("isDuplicate()", () => {
    test("should return false for new signal", () => {
      const signal = { source: "api", type: "error", severity: "high" };
      expect(debounce.isDuplicate(signal)).toBe(false);
    });

    test("should return true for duplicate signal within window", () => {
      const signal = { source: "api", type: "error", severity: "high" };
      const currentTime = Date.now();

      debounce.shouldProcess(debounce.generateKey(signal), currentTime);
      const isDup = debounce.isDuplicate(signal, currentTime + 2000);

      expect(isDup).toBe(true);
    });

    test("should return false for signal outside window", () => {
      const signal = { source: "api", type: "error", severity: "high" };
      const currentTime = Date.now();

      debounce.shouldProcess(debounce.generateKey(signal), currentTime);
      const isDup = debounce.isDuplicate(signal, currentTime + 6000);

      expect(isDup).toBe(false);
    });

    test("should differentiate signals by severity", () => {
      const signal1 = { source: "api", type: "error", severity: "high" };
      const signal2 = { source: "api", type: "error", severity: "low" };

      debounce.shouldProcess(debounce.generateKey(signal1));

      expect(debounce.isDuplicate(signal2)).toBe(false);
    });
  });

  describe("cleanup()", () => {
    test("should remove old entries", () => {
      const baseTime = Date.now();

      debounce.shouldProcess("signal1", baseTime);
      debounce.shouldProcess("signal2", baseTime + 1000);
      debounce.shouldProcess("signal3", baseTime + 2000);

      expect(debounce.signalMap.size).toBe(3);

      // Cleanup with time far in future (beyond double window)
      debounce.cleanup(baseTime + 15000);

      expect(debounce.signalMap.size).toBe(0);
    });

    test("should keep recent entries", () => {
      const baseTime = Date.now();

      debounce.shouldProcess("signal1", baseTime);
      debounce.shouldProcess("signal2", baseTime + 1000);

      debounce.cleanup(baseTime + 3000);

      expect(debounce.signalMap.size).toBe(2);
    });

    test("should partially clean old entries", () => {
      const baseTime = Date.now();

      debounce.shouldProcess("old", baseTime);
      debounce.shouldProcess("recent", baseTime + 8000);

      debounce.cleanup(baseTime + 12000);

      expect(debounce.signalMap.has("old")).toBe(false);
      expect(debounce.signalMap.has("recent")).toBe(true);
    });
  });

  describe("reset()", () => {
    test("should clear all entries", () => {
      debounce.shouldProcess("signal1");
      debounce.shouldProcess("signal2");
      debounce.shouldProcess("signal3");

      expect(debounce.signalMap.size).toBe(3);

      debounce.reset();

      expect(debounce.signalMap.size).toBe(0);
    });
  });

  describe("getState()", () => {
    test("should return current state", () => {
      const baseTime = Date.now();

      debounce.shouldProcess("signal1", baseTime);
      debounce.shouldProcess("signal2", baseTime + 1000);

      const state = debounce.getState();

      expect(state.windowMs).toBe(5000);
      expect(state.activeSignals).toBe(2);
      expect(state.signals).toHaveLength(2);
    });

    test("should include signal details in state", () => {
      const baseTime = Date.now();

      debounce.shouldProcess("test-signal", baseTime);

      const state = debounce.getState();

      expect(state.signals[0].key).toBe("test-signal");
      expect(state.signals[0].lastSeenAt).toBeDefined();
    });
  });

  describe("Burst Traffic Simulation", () => {
    test("should debounce rapid duplicate signals", () => {
      const signal = { source: "api", type: "error", severity: "high" };
      const baseTime = Date.now();

      const results = [];

      // Simulate 10 identical signals in quick succession
      for (let i = 0; i < 10; i++) {
        results.push(debounce.isDuplicate(signal, baseTime + i * 100));
      }

      // First should be false (not a duplicate), rest should be true
      expect(results[0]).toBe(false);
      expect(results.slice(1).every((r) => r === true)).toBe(true);
    });

    test("should allow signals after window expires", () => {
      const signal = { source: "api", type: "error", severity: "high" };
      const baseTime = Date.now();

      debounce.isDuplicate(signal, baseTime);
      const secondWave = debounce.isDuplicate(signal, baseTime + 6000);
      const thirdWave = debounce.isDuplicate(signal, baseTime + 12000);

      expect(secondWave).toBe(false); // Should process after 5s window
      expect(thirdWave).toBe(false); // Should process again after second 5s window
    });

    test("should handle multiple different signal types", () => {
      const baseTime = Date.now();
      const signals = [
        { source: "api-1", type: "error", severity: "high" },
        { source: "api-2", type: "error", severity: "high" },
        { source: "db", type: "timeout", severity: "critical" },
        { source: "cache", type: "hit", severity: "low" },
      ];

      signals.forEach((sig) => {
        expect(debounce.isDuplicate(sig, baseTime)).toBe(false);
      });

      // Send duplicates of all
      const results = signals.map((sig) =>
        debounce.isDuplicate(sig, baseTime + 1000)
      );

      expect(results.every((r) => r === true)).toBe(true);
    });
  });
});
