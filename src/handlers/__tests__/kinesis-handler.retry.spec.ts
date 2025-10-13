import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KinesisHandler } from '../kinesis-handler';
import {
  createMockKinesisRecords,
  createMockCheckpointManager,
  createMockDLQHandler,
  createFailingEventProcessors,
  createMockEventProcessors,
} from './test-helpers';
import { idempotencyTracker } from '../../utils/idempotency';

describe('KinesisHandler - Retry Logic', () => {
  let mockCheckpointManager: ReturnType<typeof createMockCheckpointManager>;
  let mockDLQHandler: ReturnType<typeof createMockDLQHandler>;

  beforeEach(() => {
    vi.clearAllMocks();
    (idempotencyTracker as any).processedEvents.clear();

    mockCheckpointManager = createMockCheckpointManager();
    mockDLQHandler = createMockDLQHandler();
  });

  it('should retry failing records up to max attempts (default 3)', async () => {
    // Fails 5 times (more than max retries)
    const failingProcessors = createFailingEventProcessors(5);

    const handler = new KinesisHandler(
      failingProcessors.processors,
      mockCheckpointManager.mock,
      mockDLQHandler.mock
    );

    const records = createMockKinesisRecords(1);

    await handler.processBatch(records);

    // Should attempt 3 times (max retries = 3)
    expect(failingProcessors.userLimitService.processEvent).toHaveBeenCalledTimes(3);

    // Should mark as failed and send to DLQ
    expect(mockDLQHandler.sendBatchToDLQ).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          attemptCount: 3,
          error: expect.any(Error),
        }),
      ])
    );
  });
});
