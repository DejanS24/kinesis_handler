import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { KinesisHandler } from '../kinesis-handler';
import {
  createMockKinesisRecord,
  createMockCheckpointManager,
  createMockDLQHandler,
  createMockEventProcessors,
} from './test-helpers';
import { idempotencyTracker } from '../../utils/idempotency';

describe('KinesisHandler - Idempotency', () => {
  let handler: KinesisHandler;
  let mockCheckpointManager: ReturnType<typeof createMockCheckpointManager>;
  let mockDLQHandler: ReturnType<typeof createMockDLQHandler>;
  let mockProcessors: ReturnType<typeof createMockEventProcessors>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear idempotency tracker before each test
    (idempotencyTracker as any).processedEvents.clear();

    mockCheckpointManager = createMockCheckpointManager();
    mockDLQHandler = createMockDLQHandler();
    mockProcessors = createMockEventProcessors();

    handler = new KinesisHandler(
      mockProcessors.processors,
      mockCheckpointManager.mock,
      mockDLQHandler.mock
    );
  });

  afterEach(() => {
    // Cleanup after tests
    (idempotencyTracker as any).processedEvents.clear();
  });

  it('should skip duplicate events with same eventId', async () => {
    const record1 = createMockKinesisRecord(0, { eventId: 'duplicate-event' });
    const record2 = createMockKinesisRecord(1, { eventId: 'duplicate-event' });

    // Process first record
    await handler.processBatch([record1]);

    // Process duplicate
    await handler.processBatch([record2]);

    // Should only process once
    expect(mockProcessors.userLimitService.processEvent).toHaveBeenCalledTimes(1);
  });
});
