import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { KinesisStreamRecord } from 'aws-lambda';
import { createChildLogger } from '../infrastructure/logger';

const logger = createChildLogger({ service: 'dlq' });

export interface DLQMessage {
  originalEvent: KinesisStreamRecord;
  error: {
    message: string;
    name: string;
    stack?: string;
  };
  metadata: {
    attemptCount: number;
    firstAttemptTimestamp: number;
    lastAttemptTimestamp: number;
    correlationId?: string;
  };
}

/**
 * Dead Letter Queue handler for failed Kinesis records
 */
export class DLQHandler {
  private client: SQSClient;
  private queueUrl: string;

  constructor(queueUrl?: string) {
    this.queueUrl = queueUrl || process.env.DLQ_URL || '';

    if (!this.queueUrl) {
      logger.warn({}, 'DLQ URL not configured, DLQ functionality disabled');
    }

    this.client = new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });
  }

  /**
   * Send a failed record to the DLQ
   */
  async sendToDLQ(
    record: KinesisStreamRecord,
    error: Error,
    attemptCount: number,
    correlationId?: string
  ): Promise<void> {
    if (!this.queueUrl) {
      logger.warn(
        {
          eventID: record.eventID,
        },
        'DLQ not configured, cannot send failed record'
      );
      return;
    }

    try {
      const dlqMessage: DLQMessage = {
        originalEvent: record,
        error: {
          message: error.message,
          name: error.name,
          stack: error.stack,
        },
        metadata: {
          attemptCount,
          firstAttemptTimestamp: record.kinesis.approximateArrivalTimestamp
            ? record.kinesis.approximateArrivalTimestamp * 1000
            : Date.now(),
          lastAttemptTimestamp: Date.now(),
          correlationId,
        },
      };

      const command = new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(dlqMessage, null, 2),
        MessageAttributes: {
          EventID: {
            DataType: 'String',
            StringValue: record.eventID,
          },
          SequenceNumber: {
            DataType: 'String',
            StringValue: record.kinesis.sequenceNumber,
          },
          ErrorType: {
            DataType: 'String',
            StringValue: error.name,
          },
          AttemptCount: {
            DataType: 'Number',
            StringValue: String(attemptCount),
          },
          ...(correlationId && {
            CorrelationId: {
              DataType: 'String',
              StringValue: correlationId,
            },
          }),
        },
      });

      await this.client.send(command);

      logger.info(
        {
          eventID: record.eventID,
          sequenceNumber: record.kinesis.sequenceNumber,
          errorType: error.name,
          attemptCount,
          correlationId,
        },
        'Record sent to DLQ'
      );
    } catch (dlqError) {
      logger.error(
        {
          eventID: record.eventID,
          error: dlqError instanceof Error ? dlqError.message : String(dlqError),
          originalError: error.message,
        },
        'Failed to send record to DLQ'
      );
      // Don't throw - we don't want DLQ failures to block processing
    }
  }

  /**
   * Send multiple failed records to DLQ in batch
   */
  async sendBatchToDLQ(
    failures: Array<{
      record: KinesisStreamRecord;
      error: Error;
      attemptCount: number;
      correlationId?: string;
    }>
  ): Promise<void> {
    if (!this.queueUrl || failures.length === 0) {
      return;
    }

    logger.info({ count: failures.length }, 'Sending batch to DLQ');

    // Send in parallel with Promise.allSettled to not fail the whole batch
    const results = await Promise.allSettled(
      failures.map((failure) =>
        this.sendToDLQ(failure.record, failure.error, failure.attemptCount, failure.correlationId)
      )
    );

    const failedCount = results.filter((r) => r.status === 'rejected').length;
    if (failedCount > 0) {
      logger.error(
        {
          total: failures.length,
          failed: failedCount,
        },
        'Some records failed to send to DLQ'
      );
    }
  }
}

// Singleton instance
export const dlqHandler = new DLQHandler();
