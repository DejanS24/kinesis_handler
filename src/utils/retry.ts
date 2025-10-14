import { logger } from '../infrastructure/logger';

export interface RetryOptions {
  maxAttempts?: number;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const RETRY_DELAYS = [100, 500, 1000]; // ms for attempts 1, 2, 3

export async function retryWithBackoff<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  let lastError: unknown;
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt++;

    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!isRetryableError(error)) {
        throw error;
      }

      if (attempt >= maxAttempts) {
        break;
      }

      const delayMs = RETRY_DELAYS[attempt - 1] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1];
      await sleep(delayMs);
    }
  }

  logger.error(
    {
      maxAttempts,
      lastError: lastError instanceof Error ? lastError.message : String(lastError),
    },
    'All retry attempts failed'
  );

  throw lastError;
}

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  // Don't retry skipped records
  if (error.name === 'SkippedRecordError') return false;

  // Don't retry validation errors
  const nonRetryablePatterns = ['must be one of the following values', 'validation failed', 'invalid'];
  const errorMessage = error.message.toLowerCase();
  if (nonRetryablePatterns.some((pattern) => errorMessage.includes(pattern))) {
    return false;
  }

  // Retry on known transient errors
  const retryableErrors = [
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ThrottlingException',
    'ProvisionedThroughputExceededException',
    'RequestTimeout',
    'ServiceUnavailable',
  ];

  const errorIdentifier = (error as { code?: string }).code || error.name;
  if (retryableErrors.some((retryable) => errorIdentifier.includes(retryable))) {
    return true;
  }

  // Generic errors without specific codes are retryable by default
  return !errorIdentifier || errorIdentifier === 'Error';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
