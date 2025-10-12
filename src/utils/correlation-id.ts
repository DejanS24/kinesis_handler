import { KinesisStreamRecord } from 'aws-lambda';
import { randomUUID } from 'crypto';

/**
 * Extract or generate correlation ID for request tracking
 *
 * Priority:
 * 1. Extract from Kinesis record approximateArrivalTimestamp + sequenceNumber
 * 2. Extract from record metadata if present
 * 3. Generate new UUID
 */
export function getCorrelationId(record?: KinesisStreamRecord): string {
  if (record?.kinesis) {
    // Use combination of timestamp and sequence number for deterministic ID
    const timestamp = record.kinesis.approximateArrivalTimestamp;
    const sequence = record.kinesis.sequenceNumber;

    if (timestamp && sequence) {
      // Create a shortened, readable correlation ID
      const shortSequence = sequence.slice(-8);
      return `${Math.floor(timestamp)}-${shortSequence}`;
    }
  }

  // Fallback to UUID
  return randomUUID();
}

/**
 * Extract user ID from Kinesis record if available
 * This can be used as additional context in logging
 */
export function extractUserId(record?: KinesisStreamRecord): string | undefined {
  if (record?.kinesis?.partitionKey) {
    return record.kinesis.partitionKey;
  }
  return undefined;
}

/**
 * Create logging context with correlation ID and optional metadata
 */
export function createLoggingContext(
  correlationId: string,
  additionalContext?: Record<string, unknown>
): Record<string, unknown> {
  return {
    correlationId,
    ...additionalContext,
  };
}
