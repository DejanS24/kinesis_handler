import { Logger } from '@aws-lambda-powertools/logger';

const logger = new Logger({
  logLevel: 'INFO',
  serviceName: 'circuit-breaker',
});

export enum CircuitState {
  CLOSED = 'CLOSED', // Normal operation
  OPEN = 'OPEN', // Failing, reject requests
  HALF_OPEN = 'HALF_OPEN', // Testing if service recovered
}

export interface CircuitBreakerOptions {
  failureThreshold?: number; // Number of failures before opening
  successThreshold?: number; // Number of successes in HALF_OPEN before closing
  timeout?: number; // Time in ms before trying HALF_OPEN
  name?: string; // Name for logging
}

const DEFAULT_OPTIONS: Required<CircuitBreakerOptions> = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 60000, // 60 seconds
  name: 'default',
};

/**
 * Circuit Breaker Pattern Implementation
 *
 * Protects against cascading failures by:
 * - CLOSED: Normal operation, tracks failures
 * - OPEN: After threshold failures, rejects all requests immediately
 * - HALF_OPEN: After timeout, allows limited requests to test recovery
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private nextAttemptTime = 0;
  private options: Required<CircuitBreakerOptions>;

  constructor(options: CircuitBreakerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    logger.info('Circuit breaker initialized', {
      name: this.options.name,
      failureThreshold: this.options.failureThreshold,
      timeout: this.options.timeout,
    });
  }

  /**
   * Execute function through circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        logger.warn('Circuit breaker is OPEN, rejecting request', {
          name: this.options.name,
          nextAttemptTime: this.nextAttemptTime,
        });
        throw new CircuitBreakerOpenError(
          `Circuit breaker ${this.options.name} is OPEN. Retry after ${new Date(this.nextAttemptTime).toISOString()}`
        );
      }

      // Transition to HALF_OPEN
      this.transitionTo(CircuitState.HALF_OPEN);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      logger.info('Circuit breaker success in HALF_OPEN', {
        name: this.options.name,
        successCount: this.successCount,
        successThreshold: this.options.successThreshold,
      });

      if (this.successCount >= this.options.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success
      this.failureCount = 0;
    }
  }

  private onFailure(): void {
    this.failureCount++;

    logger.warn('Circuit breaker failure', {
      name: this.options.name,
      state: this.state,
      failureCount: this.failureCount,
      failureThreshold: this.options.failureThreshold,
    });

    if (this.state === CircuitState.HALF_OPEN) {
      // Immediately open on failure in HALF_OPEN
      this.transitionTo(CircuitState.OPEN);
    } else if (
      this.state === CircuitState.CLOSED &&
      this.failureCount >= this.options.failureThreshold
    ) {
      this.transitionTo(CircuitState.OPEN);
    }
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    logger.info('Circuit breaker state transition', {
      name: this.options.name,
      from: oldState,
      to: newState,
    });

    switch (newState) {
      case CircuitState.CLOSED:
        this.failureCount = 0;
        this.successCount = 0;
        this.nextAttemptTime = 0;
        break;

      case CircuitState.OPEN:
        this.nextAttemptTime = Date.now() + this.options.timeout;
        this.successCount = 0;
        break;

      case CircuitState.HALF_OPEN:
        this.successCount = 0;
        this.failureCount = 0;
        break;
    }
  }

  /**
   * Get current circuit breaker state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get circuit breaker stats
   */
  getStats(): {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    nextAttemptTime: number;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      nextAttemptTime: this.nextAttemptTime,
    };
  }

  /**
   * Manually reset circuit breaker to CLOSED state
   */
  reset(): void {
    logger.info('Circuit breaker manually reset', { name: this.options.name });
    this.transitionTo(CircuitState.CLOSED);
  }
}

export class CircuitBreakerOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}
