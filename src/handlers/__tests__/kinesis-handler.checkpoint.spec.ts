import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KinesisHandler } from '../kinesis-handler';
import {
  createMockKinesisRecords,
  createMockCheckpointManager,
  createMockDLQHandler,
  createMockEventProcessors,
  createFailingEventProcessors,
  getCheckpointFromCalls,
} from './test-helpers';
import { idempotencyTracker } from '../../utils/idempotency';

describe('KinesisHandler - Checkpoint', () => {
  let handler: KinesisHandler;
  let mockCheckpointManager: ReturnType<typeof createMockCheckpointManager>;
  let mockDLQHandler: ReturnType<typeof createMockDLQHandler>;
  let mockProcessors: ReturnType<typeof createMockEventProcessors>;

  beforeEach(() => {
    vi.clearAllMocks();
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

  it('should save checkpoint after successful batch processing', async () => {
    const records = createMockKinesisRecords(5);

    await handler.processBatch(records);

    expect(mockCheckpointManager.saveCheckpoint).toHaveBeenCalledTimes(1);
  });

  it('should save checkpoint with correct sequence number (last successful record)', async () => {
    const records = createMockKinesisRecords(5);

    await handler.processBatch(records);

    const checkpoint = getCheckpointFromCalls(mockCheckpointManager.saveCheckpoint);

    expect(checkpoint).toBeDefined();
    expect(checkpoint?.sequenceNumber).toBe('4'); // Last record (index 4)
    expect(checkpoint?.shardId).toBe('arn:aws:kinesis:us-east-1:123456789012:stream/test');
    expect(checkpoint?.timestamp).toBeGreaterThan(0);
    expect(checkpoint?.recordCount).toBe(1);
  });
});
