import { KinesisStreamRecord } from 'aws-lambda';
import { vi } from 'vitest';
import { ICheckpointManager, Checkpoint } from '../../utils/checkpointing';
import { DLQHandler } from '../../utils/dlq';
import { UserLimitService } from '../../user-limit/services/user-limit-service';
import { EventType } from '../../user-limit/models/events';
import { EventProcessor } from '../../processors/event-processor';
import { UserLimitEventProcessor } from '../../processors/user-limit-event-processor';

/**
 * Create mock Kinesis records for testing
 */
export function createMockKinesisRecord(
  index: number,
  overrides?: {
    eventId?: string;
    eventType?: EventType;
    userId?: string;
    userLimitId?: string;
    sequenceNumber?: string;
  }
): KinesisStreamRecord {
  const eventId = overrides?.eventId || `event-${index}`;
  const userId = overrides?.userId || `user-${index}`;
  const eventType = overrides?.eventType || EventType.USER_LIMIT_CREATED;
  const userLimitId = overrides?.userLimitId || `limit-${index}`;

  // Base fields required for all events
  const basePayload = {
    eventId,
    eventType,
    timestamp: new Date().toISOString(),
    userId,
    userLimitId,
    brandId: 'test-brand',
    currencyCode: 'USD',
  };

  // Add event-type specific fields
  let eventPayload: any;

  if (eventType === EventType.USER_LIMIT_CREATED) {
    eventPayload = {
      ...basePayload,
      type: 'DEPOSIT',
      period: 'DAY',
      value: '1000',
      status: 'ACTIVE',
      activeFrom: Date.now(),
    };
  } else if (eventType === EventType.USER_LIMIT_PROGRESS_CHANGED) {
    eventPayload = {
      ...basePayload,
      amount: '500', // Required for PROGRESS_CHANGED
    };
  } else if (eventType === EventType.USER_LIMIT_RESET) {
    eventPayload = {
      ...basePayload,
      type: 'DEPOSIT',
      period: 'DAY',
    };
  } else {
    // Fallback for any custom event type
    eventPayload = {
      ...basePayload,
      type: 'DEPOSIT',
      period: 'DAY',
      value: '1000',
      status: 'ACTIVE',
      activeFrom: Date.now(),
    };
  }

  const data = Buffer.from(JSON.stringify(eventPayload)).toString('base64');

  return {
    kinesis: {
      kinesisSchemaVersion: '1.0',
      partitionKey: userId,
      sequenceNumber: overrides?.sequenceNumber || String(index),
      data,
      approximateArrivalTimestamp: Date.now() / 1000,
    },
    eventSource: 'aws:kinesis',
    eventVersion: '1.0',
    eventID: `shardId-000000000000:${eventId}`,
    eventName: 'aws:kinesis:record',
    invokeIdentityArn: 'arn:aws:iam::123456789012:role/lambda-role',
    awsRegion: 'us-east-1',
    eventSourceARN: 'arn:aws:kinesis:us-east-1:123456789012:stream/test',
  };
}

/**
 * Create multiple mock Kinesis records
 */
export function createMockKinesisRecords(count: number): KinesisStreamRecord[] {
  return Array.from({ length: count }, (_, i) => createMockKinesisRecord(i));
}

/**
 * Mock checkpoint manager
 */
export function createMockCheckpointManager(): {
  mock: ICheckpointManager;
  saveCheckpoint: ReturnType<typeof vi.fn>;
  getCheckpoint: ReturnType<typeof vi.fn>;
  deleteCheckpoint: ReturnType<typeof vi.fn>;
} {
  const saveCheckpoint = vi.fn().mockResolvedValue(undefined);
  const getCheckpoint = vi.fn().mockResolvedValue(null);
  const deleteCheckpoint = vi.fn().mockResolvedValue(undefined);

  return {
    mock: {
      saveCheckpoint,
      getCheckpoint,
      deleteCheckpoint,
    },
    saveCheckpoint,
    getCheckpoint,
    deleteCheckpoint,
  };
}

/**
 * Mock DLQ handler
 */
export function createMockDLQHandler(): {
  mock: DLQHandler;
  sendToDLQ: ReturnType<typeof vi.fn>;
  sendBatchToDLQ: ReturnType<typeof vi.fn>;
} {
  const sendToDLQ = vi.fn().mockResolvedValue(undefined);
  const sendBatchToDLQ = vi.fn().mockResolvedValue(undefined);

  // Create partial mock (only mock the methods we need)
  const mock = {
    sendToDLQ,
    sendBatchToDLQ,
  } as unknown as DLQHandler;

  return {
    mock,
    sendToDLQ,
    sendBatchToDLQ,
  };
}

/**
 * Mock UserLimitService
 */
export function createMockUserLimitService(): {
  mock: UserLimitService;
  processEvent: ReturnType<typeof vi.fn>;
} {
  const processEvent = vi.fn().mockResolvedValue(undefined);

  const mock = {
    processEvent,
  } as unknown as UserLimitService;

  return {
    mock,
    processEvent,
  };
}

/**
 * Create a failing service (for retry tests)
 */
export function createFailingUserLimitService(
  failCount: number,
  errorMessage = 'Service error'
): {
  mock: UserLimitService;
  processEvent: ReturnType<typeof vi.fn>;
} {
  let attemptCount = 0;

  const processEvent = vi.fn().mockImplementation(async () => {
    attemptCount++;
    if (attemptCount <= failCount) {
      throw new Error(errorMessage);
    }
    // Success after failCount attempts
    return undefined;
  });

  const mock = {
    processEvent,
  } as unknown as UserLimitService;

  return {
    mock,
    processEvent,
  };
}

/**
 * Sleep helper for async tests
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get checkpoint from mock calls
 */
export function getCheckpointFromCalls(
  saveCheckpoint: ReturnType<typeof vi.fn>
): Checkpoint | undefined {
  const calls = saveCheckpoint.mock.calls;
  if (calls.length === 0) return undefined;
  return calls[calls.length - 1][0] as Checkpoint;
}

/**
 * Create mock event processors (wraps UserLimitService)
 */
export function createMockEventProcessors(): {
  processors: EventProcessor[];
  userLimitService: ReturnType<typeof createMockUserLimitService>;
} {
  const userLimitService = createMockUserLimitService();
  const processor = new UserLimitEventProcessor(userLimitService.mock);

  return {
    processors: [processor],
    userLimitService,
  };
}

/**
 * Create failing event processors (for retry tests)
 */
export function createFailingEventProcessors(
  failCount: number,
  errorMessage = 'Service error'
): {
  processors: EventProcessor[];
  userLimitService: ReturnType<typeof createFailingUserLimitService>;
} {
  const userLimitService = createFailingUserLimitService(failCount, errorMessage);
  const processor = new UserLimitEventProcessor(userLimitService.mock);

  return {
    processors: [processor],
    userLimitService,
  };
}
