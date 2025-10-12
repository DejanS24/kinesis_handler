import { Logger } from '@aws-lambda-powertools/logger';

const logger = new Logger({
  logLevel: 'INFO',
  serviceName: 'idempotency',
});

/**
 * In-memory idempotency tracker
 * Tracks processed eventIds to prevent duplicate processing
 *
 * In production, this should be backed by DynamoDB or Redis with TTL
 */
export class IdempotencyTracker {
  private processedEvents: Map<string, { timestamp: number; userId: string }> = new Map();
  private ttlMs: number;
  private cleanupIntervalMs: number;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(ttlMs = 3600000, cleanupIntervalMs = 300000) {
    // Default: 1 hour TTL, cleanup every 5 minutes
    this.ttlMs = ttlMs;
    this.cleanupIntervalMs = cleanupIntervalMs;
    this.startCleanup();
  }

  /**
   * Check if an event has already been processed
   */
  isProcessed(eventId: string): boolean {
    const entry = this.processedEvents.get(eventId);

    if (!entry) {
      return false;
    }

    // Check if entry has expired
    const isExpired = Date.now() - entry.timestamp > this.ttlMs;
    if (isExpired) {
      this.processedEvents.delete(eventId);
      return false;
    }

    logger.info('Duplicate event detected', {
      eventId,
      userId: entry.userId,
      processedAt: new Date(entry.timestamp).toISOString(),
    });

    return true;
  }

  /**
   * Mark an event as processed
   */
  markProcessed(eventId: string, userId: string): void {
    this.processedEvents.set(eventId, {
      timestamp: Date.now(),
      userId,
    });

    logger.debug('Event marked as processed', {
      eventId,
      userId,
      totalTracked: this.processedEvents.size,
    });
  }

  /**
   * Remove expired entries periodically
   */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      for (const [eventId, entry] of this.processedEvents.entries()) {
        if (now - entry.timestamp > this.ttlMs) {
          this.processedEvents.delete(eventId);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        logger.debug('Cleaned up expired idempotency entries', {
          cleaned,
          remaining: this.processedEvents.size,
        });
      }
    }, this.cleanupIntervalMs);

    // Ensure timer doesn't prevent process exit
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Stop cleanup timer (for testing/shutdown)
   */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Get statistics
   */
  getStats(): { trackedCount: number; oldestEntry: number | null } {
    let oldestTimestamp: number | null = null;

    for (const entry of this.processedEvents.values()) {
      if (oldestTimestamp === null || entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
      }
    }

    return {
      trackedCount: this.processedEvents.size,
      oldestEntry: oldestTimestamp,
    };
  }

  /**
   * Clear all tracked events (for testing)
   */
  clear(): void {
    this.processedEvents.clear();
    logger.info('Idempotency tracker cleared');
  }
}

// Singleton instance
export const idempotencyTracker = new IdempotencyTracker();
