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
    mockProcessors.userLimitService.processEvent.mockImplementation((event: { userLimitId?: string }) => {
      if (event.userLimitId === 'limit-2' || event.userLimitId === 'limit-4') {
        throw new Error('Processing failed');
      }
      return Promise.resolve();
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
