/**
 * Integration Tests for Retry Mechanism
 */

const { retryWithBackoff, RetryError } = require("../utils/retry");

describe("Retry with Backoff", () => {
  describe("Successful Execution", () => {
    test("should succeed on first attempt", async () => {
      const mockFn = jest.fn().mockResolvedValue("success");

      const result = await retryWithBackoff(mockFn);

      expect(result).toBe("success");
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    test("should succeed after one retry", async () => {
      const mockFn = jest
        .fn()
        .mockRejectedValueOnce(new Error("Attempt 1"))
        .mockResolvedValueOnce("success");

      const result = await retryWithBackoff(mockFn, 3, 100);

      expect(result).toBe("success");
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    test("should succeed after multiple retries", async () => {
      const mockFn = jest
        .fn()
        .mockRejectedValueOnce(new Error("Attempt 1"))
        .mockRejectedValueOnce(new Error("Attempt 2"))
        .mockResolvedValueOnce("success");

      const result = await retryWithBackoff(mockFn, 3, 100);

      expect(result).toBe("success");
      expect(mockFn).toHaveBeenCalledTimes(3);
    });
  });

  describe("Failure Cases", () => {
    test("should throw RetryError after max attempts", async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error("Always fails"));

      await expect(retryWithBackoff(mockFn, 3, 100)).rejects.toThrow(
        RetryError
      );
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    test("should preserve original error details", async () => {
      const originalError = new Error("Database connection failed");
      const mockFn = jest.fn().mockRejectedValue(originalError);

      try {
        await retryWithBackoff(mockFn, 2, 100);
      } catch (err) {
        expect(err).toBeInstanceOf(RetryError);
        expect(err.lastError).toBe(originalError);
        expect(err.attempts).toBe(2);
      }
    });

    test("should fail on first attempt if maxAttempts is 1", async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error("Fails"));

      await expect(retryWithBackoff(mockFn, 1, 100)).rejects.toThrow(
        RetryError
      );
      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("Backoff Delay", () => {
    test("should apply exponential backoff", async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error("Fails"));
      const timings = [];
      const trackingFn = jest.fn().mockImplementation(() => {
        timings.push(Date.now());
      });

      const startTime = Date.now();

      try {
        await retryWithBackoff(mockFn, 4, 100, 2, trackingFn);
      } catch (err) {
        // Expected to fail
      }

      // Should have 3 retries (after attempts 1, 2, 3)
      expect(trackingFn).toHaveBeenCalledTimes(3);

      // Check exponential backoff
      // 1st retry: 100ms, 2nd retry: 200ms, 3rd retry: 400ms
      // Allow 50ms tolerance
      const delay1 = timings[1] - timings[0];
      const delay2 = timings[2] - timings[1];

      expect(delay1).toBeGreaterThanOrEqual(100);
      expect(delay1).toBeLessThan(150);
      expect(delay2).toBeGreaterThanOrEqual(200);
      expect(delay2).toBeLessThan(250);
    });

    test("should use custom backoff multiplier", async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error("Fails"));

      const retryInfo = [];
      const onRetry = jest.fn((info) => {
        retryInfo.push(info);
      });

      try {
        await retryWithBackoff(mockFn, 3, 100, 3, onRetry);
      } catch (err) {
        // Expected to fail
      }

      // Delays should be: 100ms, 300ms
      expect(retryInfo[0].nextRetryIn).toBe(100);
      expect(retryInfo[1].nextRetryIn).toBe(300);
    });
  });

  describe("Callback Handling", () => {
    test("should call onRetry callback for each retry", async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error("Fails"));
      const onRetry = jest.fn();

      try {
        await retryWithBackoff(mockFn, 3, 100, 2, onRetry);
      } catch (err) {
        // Expected to fail
      }

      expect(onRetry).toHaveBeenCalledTimes(2);
    });

    test("should pass correct retry info to callback", async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error("Connection timeout"));
      const onRetry = jest.fn();

      try {
        await retryWithBackoff(mockFn, 3, 100, 2, onRetry);
      } catch (err) {
        // Expected to fail
      }

      const firstCall = onRetry.mock.calls[0][0];
      expect(firstCall).toHaveProperty("attempt");
      expect(firstCall).toHaveProperty("nextRetryIn");
      expect(firstCall).toHaveProperty("error");

      expect(firstCall.attempt).toBe(1);
      expect(firstCall.error).toContain("Connection timeout");
    });

    test("should not call onRetry if no callback provided", async () => {
      const mockFn = jest
        .fn()
        .mockRejectedValueOnce(new Error("Error"))
        .mockResolvedValueOnce("success");

      const result = await retryWithBackoff(mockFn, 2, 100);

      expect(result).toBe("success");
      expect(mockFn).toHaveBeenCalledTimes(2);
    });
  });

  describe("Custom Configuration", () => {
    test("should accept custom maxAttempts", async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error("Fails"));

      try {
        await retryWithBackoff(mockFn, 5, 10);
      } catch (err) {
        expect(err).toBeInstanceOf(RetryError);
        expect(err.attempts).toBe(5);
      }

      expect(mockFn).toHaveBeenCalledTimes(5);
    });

    test("should accept custom initialDelayMs", async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error("Fails"));
      const onRetry = jest.fn();

      try {
        await retryWithBackoff(mockFn, 2, 500, 2, onRetry);
      } catch (err) {
        // Expected
      }

      expect(onRetry.mock.calls[0][0].nextRetryIn).toBe(500);
    });

    test("should handle zero backoffMultiplier", async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error("Fails"));
      const onRetry = jest.fn();

      try {
        await retryWithBackoff(mockFn, 3, 100, 0, onRetry);
      } catch (err) {
        // Expected
      }

      // With multiplier 0, all delays should be 0
      expect(onRetry.mock.calls[0][0].nextRetryIn).toBe(100);
      expect(onRetry.mock.calls[1][0].nextRetryIn).toBe(0);
    });
  });

  describe("Real-world Scenarios", () => {
    test("should retry transient database connection failures", async () => {
      let attempts = 0;
      const mockDBConnect = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.reject(new Error("ECONNREFUSED"));
        }
        return Promise.resolve({ connected: true });
      });

      const result = await retryWithBackoff(mockDBConnect, 5, 100);

      expect(result).toEqual({ connected: true });
      expect(attempts).toBe(3);
    });

    test("should handle async operations with delays", async () => {
      const mockAsyncOp = jest
        .fn()
        .mockRejectedValueOnce(new Error("Timeout"))
        .mockRejectedValueOnce(new Error("Timeout"))
        .mockResolvedValueOnce({ data: "success" });

      const result = await retryWithBackoff(mockAsyncOp, 4, 50);

      expect(result).toEqual({ data: "success" });
      expect(mockAsyncOp).toHaveBeenCalledTimes(3);
    });
  });
});
