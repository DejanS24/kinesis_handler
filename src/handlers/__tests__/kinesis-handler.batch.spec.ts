import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KinesisHandler } from '../kinesis-handler';
import {
  createMockKinesisRecords,
  createMockKinesisRecord,
  createMockCheckpointManager,
  createMockDLQHandler,
  createMockEventProcessors,
} from './test-helpers';
import { idempotencyTracker } from '../../utils/idempotency';

describe('KinesisHandler - Batch Processing', () => {
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

  it('should process all records in batch', async () => {
    const records = createMockKinesisRecords(10);

    await handler.processBatch(records);

    // Should call processEvent for each record
    expect(mockProcessors.userLimitService.processEvent).toHaveBeenCalledTimes(10);
  });

  it('should return empty batchItemFailures when all records succeed', async () => {
    const records = createMockKinesisRecords(5);

    const result = await handler.processBatch(records);

    expect(result.batchItemFailures).toEqual([]);
  });

  it('should return partial batch failures for failed records', async () => {
    // Records 2 and 4 fail
    mockProcessors.userLimitService.processEvent.mockImplementation(async (event: any) => {
      if (event.userLimitId === 'limit-2' || event.userLimitId === 'limit-4') {
        throw new Error('Processing failed');
      }
    });

    const records = createMockKinesisRecords(5);

    const result = await handler.processBatch(records);

    expect(result.batchItemFailures).toHaveLength(2);
    expect(result.batchItemFailures).toEqual([
      { itemIdentifier: '2' },
      { itemIdentifier: '4' },
    ]);
  });
});
