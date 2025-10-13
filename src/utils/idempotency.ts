import { Logger } from '@aws-lambda-powertools/logger';

const logger = new Logger({
  logLevel: 'INFO',
  serviceName: 'idempotency',
});

export class IdempotencyTracker {
  private processedEvents: Map<string, { timestamp: number; userId: string }> = new Map();
  private ttlMs: number;
  private cleanupIntervalMs: number;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(ttlMs = 3600000, cleanupIntervalMs = 300000) {
    this.ttlMs = ttlMs;
    this.cleanupIntervalMs = cleanupIntervalMs;
    this.startCleanup();
  }

  private isExpired(entry: { timestamp: number; userId: string }): boolean {
    return Date.now() - entry.timestamp > this.ttlMs;
  }

  private logDuplicate(eventId: string, entry: { timestamp: number; userId: string }): void {
    logger.info('Duplicate event detected', {
      eventId,
      userId: entry.userId,
      processedAt: new Date(entry.timestamp).toISOString(),
    });
  }

  isProcessed(eventId: string): boolean {
    const entry = this.processedEvents.get(eventId);
    if (!entry) return false;

    if (this.isExpired(entry)) {
      this.processedEvents.delete(eventId);
      return false;
    }

    this.logDuplicate(eventId, entry);
    return true;
  }

  checkAndMarkInProgress(eventId: string, userId: string): boolean {
    const entry = this.processedEvents.get(eventId);

    if (entry) {
      if (this.isExpired(entry)) {
        this.processedEvents.delete(eventId);
      } else {
        this.logDuplicate(eventId, entry);
        return false;
      }
    }

    this.processedEvents.set(eventId, { timestamp: Date.now(), userId });
    logger.debug('Event marked as in progress', {
      eventId,
      userId,
      totalTracked: this.processedEvents.size,
    });

    return true;
  }

  markProcessed(eventId: string, userId: string): void {
    this.processedEvents.set(eventId, { timestamp: Date.now(), userId });
    logger.debug('Event marked as processed', { eventId, userId, totalTracked: this.processedEvents.size });
  }

  unmarkProcessed(eventId: string): void {
    const existed = this.processedEvents.delete(eventId);
    if (existed) {
      logger.debug('Event unmarked (processing failed)', { eventId, totalTracked: this.processedEvents.size });
    }
  }

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
        logger.debug('Cleaned up expired idempotency entries', { cleaned, remaining: this.processedEvents.size });
      }
    }, this.cleanupIntervalMs);

    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  getStats(): { trackedCount: number; oldestEntry: number | null } {
    let oldestTimestamp: number | null = null;

    for (const entry of this.processedEvents.values()) {
      if (oldestTimestamp === null || entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
      }
    }

    return { trackedCount: this.processedEvents.size, oldestEntry: oldestTimestamp };
  }

  clear(): void {
    this.processedEvents.clear();
    logger.info('Idempotency tracker cleared');
  }
}

export const idempotencyTracker = new IdempotencyTracker();
