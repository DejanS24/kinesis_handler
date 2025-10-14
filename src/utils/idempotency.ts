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

  isProcessed(eventId: string): boolean {
    const entry = this.processedEvents.get(eventId);
    if (!entry) return false;

    if (this.isExpired(entry)) {
      this.processedEvents.delete(eventId);
      return false;
    }

    return true;
  }

  checkAndMarkInProgress(eventId: string, userId: string): boolean {
    const entry = this.processedEvents.get(eventId);

    if (entry) {
      if (this.isExpired(entry)) {
        this.processedEvents.delete(eventId);
      } else {
        return false;
      }
    }

    this.processedEvents.set(eventId, { timestamp: Date.now(), userId });
    return true;
  }

  markProcessed(eventId: string, userId: string): void {
    this.processedEvents.set(eventId, { timestamp: Date.now(), userId });
  }

  unmarkProcessed(eventId: string): void {
    this.processedEvents.delete(eventId);
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();

      for (const [eventId, entry] of this.processedEvents.entries()) {
        if (now - entry.timestamp > this.ttlMs) {
          this.processedEvents.delete(eventId);
        }
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
  }
}

export const idempotencyTracker = new IdempotencyTracker();
