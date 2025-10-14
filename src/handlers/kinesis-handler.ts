import { KinesisStreamRecord, KinesisStreamBatchResponse } from 'aws-lambda';
import { Buffer } from 'buffer';
import { EventProcessor } from '../processors/event-processor';
import { validateEvent } from '../user-limit/validation/event-schemas';
import { logger } from '../utils/logger';
import { SkippedRecordError, ProcessingError } from '../types/errors';

export interface ProcessingResult {
  record: KinesisStreamRecord;
  success: boolean;
  error?: Error;
}

/**
 * AWS Lambda handler for processing Kinesis stream events
 *
 * Features:
 * - Batch processing
 * - Schema validation
 * - Partial failure handling (uses Lambda's built-in retry mechanism)
 * - Structured logging
 *
 * Note: Retries, DLQ, and concurrency are handled by Lambda configuration
 */
export class KinesisHandler {
  constructor(private processors: EventProcessor[]) {}

  async processBatch(records: KinesisStreamRecord[]): Promise<KinesisStreamBatchResponse> {
    const startTime = Date.now();

    try {
      const results = await Promise.all(records.map((record) => this.processRecord(record)));

      const failures = results.filter((r) => !r.success);
      const successes = results.filter((r) => r.success);

      logger.info(
        {
          total: results.length,
          successes: successes.length,
          failures: failures.length,
          duration: Date.now() - startTime,
        },
        'Batch processing complete'
      );

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

  private async processRecord(record: KinesisStreamRecord): Promise<ProcessingResult> {
    const sequenceNumber = record.kinesis.sequenceNumber;

    try {
      const data = Buffer.from(record.kinesis.data, 'base64').toString('utf-8');
      const parsedData = JSON.parse(data) as unknown;

      const validationResult = await validateEvent(parsedData);

      if (!validationResult.isValid) {
        logger.warn(
          {
            sequenceNumber,
            error: validationResult.error,
          },
          'Event validation failed, skipping record'
        );
        return { record, success: true };
      }

      const { eventType } = validationResult;
      const processor = eventType && this.processors.find((p) => p.canHandle(eventType));

      if (!processor) {
        logger.warn({ sequenceNumber, eventType }, 'No processor found for event type, skipping');
        return { record, success: true };
      }

      await processor.processEvent(
        validationResult.validatedData as Record<string, unknown>,
        eventType
      );

      logger.debug({ sequenceNumber, eventType }, 'Record processed successfully');
      return { record, success: true };
    } catch (error) {
      if (error instanceof SkippedRecordError) {
        logger.info({ sequenceNumber }, 'Record skipped');
        return { record, success: true };
      }

      logger.error(
        {
          sequenceNumber,
          error: error instanceof Error ? error.message : String(error),
        },
        'Record processing failed'
      );

      return {
        record,
        success: false,
        error: error instanceof Error ? error : new ProcessingError('Unknown error', error),
      };
    }
  }
}
