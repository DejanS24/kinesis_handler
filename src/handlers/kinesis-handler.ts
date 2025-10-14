import { KinesisStreamRecord, KinesisStreamBatchResponse } from 'aws-lambda';
import { Buffer } from 'buffer';
import pLimit from 'p-limit';
import { EventProcessor } from '../processors/event-processor';
import { validateEvent } from '../user-limit/validation/event-schemas';
import { getCorrelationId, createLoggingContext } from '../utils/correlation-id';
import { idempotencyTracker } from '../utils/idempotency';
import { ICheckpointManager } from '../utils/checkpointing';
import { DLQHandler } from '../utils/dlq';
import { retryWithBackoff } from '../utils/retry';
import { logger } from '../infrastructure/logger';

class SkippedRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkippedRecordError';
  }
}

const KINESIS_MAX_CONCURRENCY = parseInt(process.env.KINESIS_MAX_CONCURRENCY || '10', 10);
const KINESIS_MAX_RETRIES = parseInt(process.env.KINESIS_MAX_RETRIES || '3', 10);

const limit = pLimit(KINESIS_MAX_CONCURRENCY);

export interface ProcessingResult {
  record: KinesisStreamRecord;
  success: boolean;
  error?: Error;
  correlationId: string;
  attemptCount: number;
}

/**
 * AWS Lambda handler for processing Kinesis stream events
 *
 * Features:
 * - Batch processing with concurrency control
 * - Idempotency tracking
 * - Retry logic with exponential backoff
 * - Dead letter queue integration
 * - Checkpointing for resumable processing
 * - Partial failure handling
 */
export class KinesisHandler {
  constructor(
    private processors: EventProcessor[],
    private checkpointManager: ICheckpointManager,
    private dlqHandler: DLQHandler
  ) {}

  async processBatch(records: KinesisStreamRecord[]): Promise<KinesisStreamBatchResponse> {
    const startTime = Date.now();
    logger.info({ recordCount: records.length }, 'Lambda invoked');

    try {
      const results = await this.processBatchWithConcurrency(records);
      const { failures, successes } = results.reduce(
        (acc, r) => {
          r.success ? acc.successes.push(r) : acc.failures.push(r);
          return acc;
        },
        { failures: [] as ProcessingResult[], successes: [] as ProcessingResult[] }
      );

      logger.info(
        {
          total: results.length,
          successes: successes.length,
          failures: failures.length,
          duration: Date.now() - startTime,
        },
        'Batch processing complete'
      );

      if (failures.length > 0) {
        await this.handleFailures(failures);
      }

      if (successes.length > 0) {
        await this.updateCheckpoint(successes[successes.length - 1].record);
      }

      return {
        batchItemFailures: failures.map((f) => ({
          itemIdentifier: f.record.kinesis.sequenceNumber,
        })),
      };
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Fatal error in batch processing'
      );
      throw error;
    }
  }

  private async processBatchWithConcurrency(records: KinesisStreamRecord[]): Promise<ProcessingResult[]> {
    const tasks = records.map((record) => limit(() => this.processRecordWithRetry(record)));

    return Promise.all(tasks);
  }

  private async processRecordWithRetry(record: KinesisStreamRecord): Promise<ProcessingResult> {
    const correlationId = getCorrelationId(record);
    const attemptCounts = { current: 0 };

    try {
      await retryWithBackoff(
        async () => {
          attemptCounts.current++;
          await this.processRecord(record, correlationId);
        },
        {
          maxAttempts: KINESIS_MAX_RETRIES,
        }
      );

      return {
        record,
        success: true,
        correlationId,
        attemptCount: attemptCounts.current,
      };
    } catch (error) {
      if (error instanceof SkippedRecordError) {
        return {
          record,
          success: true,
          correlationId,
          attemptCount: attemptCounts.current,
        };
      }

      logger.error(
        createLoggingContext(correlationId, {
          error: error instanceof Error ? error.message : String(error),
          attemptCount: attemptCounts.current,
        }),
        'Record processing failed after all retries'
      );

      return {
        record,
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        correlationId,
        attemptCount: attemptCounts.current,
      };
    }
  }

  private async processRecord(record: KinesisStreamRecord, correlationId: string): Promise<void> {
    const data = Buffer.from(record.kinesis.data, 'base64').toString('utf-8');
    const parsedData = JSON.parse(data) as unknown;
    const event = parsedData as { eventId?: string; userId?: string };
    const { eventId, userId } = event;

    if (!eventId) {
      logger.warn(createLoggingContext(correlationId), 'Event missing eventId, cannot check idempotency');
    }

    if (eventId && userId) {
      const shouldProcess = idempotencyTracker.checkAndMarkInProgress(eventId, userId);
      if (!shouldProcess) {
        logger.info(
          createLoggingContext(correlationId, { eventId }),
          'Duplicate event detected, skipping'
        );
        throw new SkippedRecordError('Duplicate event');
      }
    }

    logger.debug(createLoggingContext(correlationId, { eventId }), 'Parsed event data');

    const validationResult = await validateEvent(parsedData);

    if (!validationResult.isValid) {
      logger.warn(
        createLoggingContext(correlationId, {
          error: validationResult.error,
        }),
        'Event validation failed, skipping'
      );

      // Unmark from idempotency (validation failures should not prevent retries)
      if (eventId) {
        idempotencyTracker.unmarkProcessed(eventId);
      }

      throw new SkippedRecordError(`Validation failed: ${validationResult.error}`);
    }

    const { eventType } = validationResult;
    const processor = eventType && this.processors.find((p) => p.canHandle(eventType));

    if (processor) {
      logger.info(
        createLoggingContext(correlationId, { eventType, eventId }),
        'Processing event'
      );

      try {
        await processor.processEvent(
          validationResult.validatedData as Record<string, unknown>,
          eventType
        );
      } catch (error) {
        if (eventId) {
          idempotencyTracker.unmarkProcessed(eventId);
        }
        throw error;
      }
    } else {
      logger.debug(
        createLoggingContext(correlationId, {
          eventType: validationResult.eventType,
        }),
        'No processor found for event type, skipping'
      );
      throw new SkippedRecordError('No processor found for event type');
    }
  }

  private async handleFailures(failures: ProcessingResult[]): Promise<void> {
    logger.info({ count: failures.length }, 'Handling failures');

    await this.dlqHandler.sendBatchToDLQ(
      failures.map((f) => ({
        record: f.record,
        error: f.error || new Error('Unknown error'),
        attemptCount: f.attemptCount,
        correlationId: f.correlationId,
      }))
    );
  }

  private async updateCheckpoint(record: KinesisStreamRecord): Promise<void> {
    try {
      // Format: arn:aws:kinesis:region:account:stream/streamName
      const shardId = record.eventSourceARN ?? 'unknown-shard';

      await this.checkpointManager.saveCheckpoint({
        shardId,
        sequenceNumber: record.kinesis.sequenceNumber,
        timestamp: Date.now(),
        recordCount: 1,
      });

      logger.debug(
        {
          shardId,
          sequenceNumber: record.kinesis.sequenceNumber,
        },
        'Checkpoint updated'
      );
    } catch (error) {
      logger.warn(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to update checkpoint'
      );
      // Don't throw - checkpoint failures shouldn't block processing
    }
  }
}
