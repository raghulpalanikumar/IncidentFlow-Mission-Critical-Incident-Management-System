/**
 * Retry mechanism with exponential backoff
 * Retries failed operations up to maxAttempts with backoff delay
 */

class RetryError extends Error {
  constructor(message, attempts, lastError) {
    super(message);
    this.name = "RetryError";
    this.attempts = attempts;
    this.lastError = lastError;
  }
}

async function retryWithBackoff(
  fn,
  maxAttempts = 3,
  initialDelayMs = 1000,
  backoffMultiplier = 2,
  onRetry = null
) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts) {
        throw new RetryError(
          `Failed after ${maxAttempts} attempts: ${error.message}`,
          attempt,
          error
        );
      }

      const delayMs = initialDelayMs * Math.pow(backoffMultiplier, attempt - 1);

      if (onRetry) {
        onRetry({
          attempt,
          nextRetryIn: delayMs,
          error: error.message,
        });
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

module.exports = { retryWithBackoff, RetryError };
