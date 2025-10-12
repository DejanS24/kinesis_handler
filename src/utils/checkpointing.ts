import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { Logger } from '@aws-lambda-powertools/logger';

const logger = new Logger({
  logLevel: 'INFO',
  serviceName: 'checkpointing',
});

export interface Checkpoint {
  shardId: string;
  sequenceNumber: string;
  timestamp: number;
  recordCount: number;
}

/**
 * DynamoDB-backed checkpoint manager for tracking processed Kinesis records
 *
 * Table Schema:
 * - shardId (String, Partition Key)
 * - sequenceNumber (String)
 * - timestamp (Number, TTL)
 * - recordCount (Number)
 */
export class CheckpointManager {
  private client: DynamoDBDocumentClient;
  private tableName: string;

  constructor(tableName?: string) {
    this.tableName = tableName || 'checkpoints';

    const dynamoClient = new DynamoDBClient({ region: 'eu-west' });
    this.client = DynamoDBDocumentClient.from(dynamoClient);

    logger.info('CheckpointManager initialized', { tableName: this.tableName });
  }

  /**
   * Save checkpoint for a shard
   */
  async saveCheckpoint(checkpoint: Checkpoint): Promise<void> {
    try {
      const command = new PutCommand({
        TableName: this.tableName,
        Item: {
          shardId: checkpoint.shardId,
          sequenceNumber: checkpoint.sequenceNumber,
          timestamp: checkpoint.timestamp,
          recordCount: checkpoint.recordCount,
          ttl: Math.floor(Date.now() / 1000),
        },
      });

      await this.client.send(command);

      logger.info('Checkpoint saved', {
        shardId: checkpoint.shardId,
        sequenceNumber: checkpoint.sequenceNumber,
        recordCount: checkpoint.recordCount,
      });
    } catch (error) {
      logger.error('Failed to save checkpoint', {
        shardId: checkpoint.shardId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get last checkpoint for a shard
   */
  async getCheckpoint(shardId: string): Promise<Checkpoint | null> {
    try {
      const command = new GetCommand({
        TableName: this.tableName,
        Key: { shardId },
      });

      const result = await this.client.send(command);

      if (!result.Item) {
        logger.debug('No checkpoint found', { shardId });
        return null;
      }

      const checkpoint: Checkpoint = {
        shardId: result.Item.shardId as string,
        sequenceNumber: result.Item.sequenceNumber as string,
        timestamp: result.Item.timestamp as number,
        recordCount: result.Item.recordCount as number,
      };

      logger.debug('Checkpoint retrieved', { checkpoint });
      return checkpoint;
    } catch (error) {
      logger.error('Failed to get checkpoint', {
        shardId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null; // Return null instead of throwing to allow processing from beginning
    }
  }

  /**
   * Delete checkpoint (for testing/cleanup)
   */
  async deleteCheckpoint(shardId: string): Promise<void> {
    try {
      const command = new DeleteCommand({
        TableName: this.tableName,
        Key: { shardId },
      });

      await this.client.send(command);
      logger.info('Checkpoint deleted', { shardId });
    } catch (error) {
      logger.error('Failed to delete checkpoint', {
        shardId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

/**
 * In-memory checkpoint manager for local development/testing
 */
export class InMemoryCheckpointManager {
  private checkpoints: Map<string, Checkpoint> = new Map();

  async saveCheckpoint(checkpoint: Checkpoint): Promise<void> {
    this.checkpoints.set(checkpoint.shardId, { ...checkpoint });
    logger.info('Checkpoint saved (in-memory)', {
      shardId: checkpoint.shardId,
      sequenceNumber: checkpoint.sequenceNumber,
    });
  }

  async getCheckpoint(shardId: string): Promise<Checkpoint | null> {
    const checkpoint = this.checkpoints.get(shardId);
    return checkpoint ? { ...checkpoint } : null;
  }

  async deleteCheckpoint(shardId: string): Promise<void> {
    this.checkpoints.delete(shardId);
    logger.info('Checkpoint deleted (in-memory)', { shardId });
  }

  clear(): void {
    this.checkpoints.clear();
  }
}

// Factory function
export function createCheckpointManager(): CheckpointManager | InMemoryCheckpointManager {
  return new InMemoryCheckpointManager();
}
