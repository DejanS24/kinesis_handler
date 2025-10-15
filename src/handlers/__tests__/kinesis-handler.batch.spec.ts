import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KinesisStreamRecord } from 'aws-lambda';
import { KinesisHandler } from '../kinesis-handler';
import {
  createMockKinesisRecords,
  createMockKinesisRecord,
  createMockEventProcessors,
} from './test-helpers';
import { EventType } from '../../user-limit/models/events';

describe('KinesisHandler - Batch Processing', () => {
  let handler: KinesisHandler;
  let mockProcessors: ReturnType<typeof createMockEventProcessors>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockProcessors = createMockEventProcessors();
    handler = new KinesisHandler(mockProcessors.processors);
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
    mockProcessors.userLimitService.processEvent.mockImplementation(
      (event: { userLimitId?: string }) => {
        if (event.userLimitId === 'limit-2' || event.userLimitId === 'limit-4') {
          throw new Error('Processing failed');
        }
        return Promise.resolve();
      }
    );

    const records = createMockKinesisRecords(5);

    const result = await handler.processBatch(records);

    expect(result.batchItemFailures).toHaveLength(2);
    expect(result.batchItemFailures).toEqual([{ itemIdentifier: '2' }, { itemIdentifier: '4' }]);
  });

  it('should process large batches correctly', async () => {
    const records = createMockKinesisRecords(100);

    const result = await handler.processBatch(records);

    expect(mockProcessors.userLimitService.processEvent).toHaveBeenCalledTimes(100);
    expect(result.batchItemFailures).toEqual([]);
  });

  it('should separate successes from failures correctly', async () => {
    // Every 3rd record fails
    mockProcessors.userLimitService.processEvent.mockImplementation(
      (event: { userLimitId?: string }) => {
        const limitId = event.userLimitId as string;
        const index = parseInt(limitId.split('-')[1], 10);
        if (index % 3 === 0) {
          throw new Error('Every 3rd fails');
        }
        return Promise.resolve();
      }
    );

    const records = createMockKinesisRecords(9);

    const result = await handler.processBatch(records);

    // Records 0, 3, 6 should fail (3 failures)
    expect(result.batchItemFailures).toHaveLength(3);
    expect(result.batchItemFailures.map((f) => f.itemIdentifier)).toEqual(['0', '3', '6']);
  });

  it('should handle empty batch', async () => {
    const records: KinesisStreamRecord[] = [];

    const result = await handler.processBatch(records);

    expect(result.batchItemFailures).toEqual([]);
    expect(mockProcessors.userLimitService.processEvent).not.toHaveBeenCalled();
  });

  it('should handle batch with all failures', async () => {
    mockProcessors.userLimitService.processEvent.mockRejectedValue(new Error('All fail'));

    const records = createMockKinesisRecords(5);

    const result = await handler.processBatch(records);

    expect(result.batchItemFailures).toHaveLength(5);
  });

  it('should process records with different event types', async () => {
    const records = [
      createMockKinesisRecord(0, { eventType: EventType.USER_LIMIT_CREATED }),
      createMockKinesisRecord(1, { eventType: EventType.USER_LIMIT_PROGRESS_CHANGED }),
      createMockKinesisRecord(2, { eventType: EventType.USER_LIMIT_RESET }),
    ];

    await handler.processBatch(records);

    expect(mockProcessors.userLimitService.processEvent).toHaveBeenCalledTimes(3);
  });
});
