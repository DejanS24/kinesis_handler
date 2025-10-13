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

export async function retryWithBackoff<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | unknown;
  let attempt = 0;

  while (attempt < opts.maxAttempts) {
    attempt++;

    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!isRetryableError(error, opts.retryableErrors)) {
        logger.warn('Non-retryable error encountered', {
          error: error instanceof Error ? error.message : String(error),
          attempt,
        });
        throw error;
      }

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
  if (!(error instanceof Error)) return false;

  if (error.name === 'SkippedRecordError') return false;

  const nonRetryablePatterns = ['must be one of the following values', 'validation failed', 'invalid'];
  const errorMessage = error.message.toLowerCase();
  if (nonRetryablePatterns.some((pattern) => errorMessage.includes(pattern))) {
    return false;
  }

  const errorIdentifier = (error as { code?: string }).code || error.name;
  if (retryableErrors.some((retryable) => errorIdentifier.includes(retryable))) {
    return true;
  }

  // Generic errors without specific codes are retryable by default
  return !errorIdentifier || errorIdentifier === 'Error';
}

function calculateDelay(attempt: number, options: Required<RetryOptions>): number {
  const exponentialDelay = options.initialDelayMs * Math.pow(options.backoffMultiplier, attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, options.maxDelayMs);
  const jitter = cappedDelay * options.jitterFactor * (Math.random() * 2 - 1);
  return Math.floor(cappedDelay + jitter);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
