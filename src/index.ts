import {
  KinesisStreamEvent,
  KinesisStreamRecord,
  KinesisStreamBatchResponse,
  Context,
} from 'aws-lambda';
import { Buffer } from 'buffer';
import pLimit from 'p-limit';
import { Logger } from '@aws-lambda-powertools/logger';
import { UserLimitService } from './services/user-limit-service';
import { InMemoryUserLimitRepository } from './repositories/user-limit-repository';
import { validateEvent } from './validation/event-schemas';
import { EventType } from './models/events';
import { getCorrelationId, createLoggingContext } from './utils/correlation-id';
import { idempotencyTracker } from './utils/idempotency';
import { createCheckpointManager } from './utils/checkpointing';
import { retryWithBackoff } from './utils/retry';

const logger = new Logger({
  logLevel: 'INFO',
  serviceName: 'kinesis-stream-handler',
});

// Initialize dependencies
const repository = new InMemoryUserLimitRepository();
const userLimitService = new UserLimitService(repository);
const checkpointManager = createCheckpointManager();

// Concurrency limiter
const limit = pLimit(10);

interface ProcessingResult {
  record: KinesisStreamRecord;
  success: boolean;
  error?: Error;
  correlationId: string;
  attemptCount: number;
}

export const functionHandler = async (
  event: KinesisStreamEvent,
  _context: Context
): Promise<KinesisStreamBatchResponse> => {
  const startTime = Date.now();
  logger.info('Lambda invoked', { recordCount: event.Records.length });

  try {
    // Process records with concurrency control
    const results = await processBatchWithConcurrency(event.Records);

    // Separate successes and failures
    const failures = results.filter((r) => !r.success);
    const successes = results.filter((r) => r.success);

    console.log('Batch processing complete', {
      total: results.length,
      successes: successes.length,
      failures: failures.length,
      duration: Date.now() - startTime,
    });

    // Handle failures
    if (failures.length > 0) {
      handleFailures(failures);
    }

    // Update checkpoint for successful records
    if (successes.length > 0) {
      await updateCheckpoint(successes[successes.length - 1].record);
    }

    // Return partial batch response
    return {
      batchItemFailures: failures.map((f) => ({
        itemIdentifier: f.record.kinesis.sequenceNumber,
      })),
    };
  } catch (error) {
    console.log('Fatal error in batch processing', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

/**
 * Process a batch of records with concurrency control
 */
async function processBatchWithConcurrency(
  records: KinesisStreamRecord[]
): Promise<ProcessingResult[]> {
  const tasks = records.map((record) =>
    limit(() => processRecordWithRetry(record))
  );

  return Promise.all(tasks);
}

/**
 * Process a single record with retry logic
 */
async function processRecordWithRetry(
  record: KinesisStreamRecord
): Promise<ProcessingResult> {
  const correlationId = getCorrelationId(record);
  let attemptCount = 0;

  try {
    await retryWithBackoff(
      async () => {
        attemptCount++;
        await processRecord(record, correlationId);
      },
      {
        maxAttempts: 3,
      }
    );

    return {
      record,
      success: true,
      correlationId,
      attemptCount,
    };
  } catch (error) {
    console.log('Record processing failed after all retries', createLoggingContext(correlationId, {
      error: error instanceof Error ? error.message : String(error),
      attemptCount,
    }));

    return {
      record,
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
      correlationId,
      attemptCount,
    };
  }
}

/**
 * Process a single Kinesis record
 */
async function processRecord(record: KinesisStreamRecord, correlationId: string): Promise<void> {
  const data = Buffer.from(record.kinesis.data, 'base64').toString('utf-8');
  const parsedData = JSON.parse(data) as unknown;

  // Extract eventId for idempotency
  const event = parsedData as { eventId?: string; userId?: string };
  const eventId = event.eventId;

  if (!eventId) {
    console.log('Event missing eventId, cannot check idempotency', createLoggingContext(correlationId));
  }

  // Idempotency check
  if (eventId && idempotencyTracker.isProcessed(eventId)) {
    console.log('Duplicate event detected, skipping', createLoggingContext(correlationId, { eventId }));
    return;
  }

  console.log('Parsed event data', createLoggingContext(correlationId, { eventId }));

  // Validate event
  const validationResult = await validateEvent(parsedData);

  if (!validationResult.isValid) {
    console.log('Event validation failed, skipping', createLoggingContext(correlationId, {
      error: validationResult.error,
    }));
    return;
  }

  // Check if it's a user limit event
  const userLimitEventTypes = [
    EventType.USER_LIMIT_CREATED,
    EventType.USER_LIMIT_PROGRESS_CHANGED,
    EventType.USER_LIMIT_RESET,
  ];

  if (validationResult.eventType && userLimitEventTypes.includes(validationResult.eventType)) {
    const eventType = validationResult.eventType;

    console.log('Processing user limit event', createLoggingContext(correlationId, { eventType, eventId }));

    await userLimitService.processEvent(
      validationResult.validatedData as Record<string, unknown> & { eventType: EventType; userId: string }
    );

    // Mark as processed (idempotency)
    if (eventId && event.userId) {
      idempotencyTracker.markProcessed(eventId, event.userId);
    }

  } else {
    console.log('Non-user-limit event, skipping', createLoggingContext(correlationId, {
      eventType: validationResult.eventType,
    }));
  }
}

/**
 * Handle failed records (send to DLQ)
 */
function handleFailures(failures: ProcessingResult[]): void {
  // TODO
  console.log('Handling failures', { count: failures.length });
}

/**
 * Update checkpoint after successful processing
 */
async function updateCheckpoint(record: KinesisStreamRecord): Promise<void> {
  try {
    // Extract shardId from eventSourceARN
    // Format: arn:aws:kinesis:region:account:stream/streamName
    const shardId = record.eventSourceARN || 'unknown-shard';

    await checkpointManager.saveCheckpoint({
      shardId,
      sequenceNumber: record.kinesis.sequenceNumber,
      timestamp: Date.now(),
      recordCount: 1,
    });

    console.log('Checkpoint updated', {
      shardId,
      sequenceNumber: record.kinesis.sequenceNumber,
    });
  } catch (error) {
    console.log('Failed to update checkpoint', {
      error: error instanceof Error ? error.message : String(error),
    });
    // Don't throw - checkpoint failures shouldn't block processing
  }
}
