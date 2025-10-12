import { Logger } from '@aws-lambda-powertools/logger';

const logger = new Logger({
  logLevel: 'INFO',
  serviceName: 'retry-utility',
});

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  jitterFactor?: number;
  retryableErrors?: string[];
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
  retryableErrors: [
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ThrottlingException',
    'ProvisionedThroughputExceededException',
    'RequestTimeout',
    'ServiceUnavailable',
  ],
};

/**
 * Retry a function with exponential backoff
 *
 * @param fn - Async function to retry
 * @param options - Retry configuration options
 * @returns Result of the function
 * @throws Last error if all retries fail
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | unknown;
  let attempt = 0;

  while (attempt < opts.maxAttempts) {
    attempt++;

    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if error is retryable
      if (!isRetryableError(error, opts.retryableErrors)) {
        logger.warn('Non-retryable error encountered', {
          error: error instanceof Error ? error.message : String(error),
          attempt,
        });
        throw error;
      }

      // Don't delay after last attempt
      if (attempt >= opts.maxAttempts) {
        break;
      }

      const delayMs = calculateDelay(attempt, opts);

      logger.warn('Retrying after error', {
        error: error instanceof Error ? error.message : String(error),
        attempt,
        nextAttempt: attempt + 1,
        maxAttempts: opts.maxAttempts,
        delayMs,
      });

      await sleep(delayMs);
    }
  }

  logger.error('All retry attempts failed', {
    maxAttempts: opts.maxAttempts,
    lastError: lastError instanceof Error ? lastError.message : String(lastError),
  });

  throw lastError;
}

function isRetryableError(error: unknown, retryableErrors: string[]): boolean {
  if (error instanceof Error) {
    // Check error name or code
    const errorIdentifier = (error as { code?: string }).code || error.name;
    return retryableErrors.some((retryable) => errorIdentifier.includes(retryable));
  }
  return false;
}

function calculateDelay(attempt: number, options: Required<RetryOptions>): number {
  // Calculate exponential backoff: initialDelay * (multiplier ^ (attempt - 1))
  const exponentialDelay = options.initialDelayMs * Math.pow(options.backoffMultiplier, attempt - 1);

  // Cap at maxDelay
  const cappedDelay = Math.min(exponentialDelay, options.maxDelayMs);

  // Add jitter: random value between -jitterFactor and +jitterFactor
  const jitter = cappedDelay * options.jitterFactor * (Math.random() * 2 - 1);

  return Math.floor(cappedDelay + jitter);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
