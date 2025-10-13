import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { config } from '../config';
import { createChildLogger } from '../infrastructure/logger';

const logger = createChildLogger({ service: 'checkpointing' });

export interface Checkpoint {
  shardId: string;
  sequenceNumber: string;
  timestamp: number;
  recordCount: number;
}

export interface ICheckpointManager {
  saveCheckpoint(checkpoint: Checkpoint): Promise<void>;
  getCheckpoint(shardId: string): Promise<Checkpoint | null>;
  deleteCheckpoint(shardId: string): Promise<void>;
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
export class CheckpointManager implements ICheckpointManager {
  private client: DynamoDBDocumentClient;
  private tableName: string;

  constructor(tableName?: string) {
    this.tableName = tableName || config.aws.dynamodb.checkpointTable;

    const dynamoClient = new DynamoDBClient({ region: config.aws.region });
    this.client = DynamoDBDocumentClient.from(dynamoClient);

    logger.info({ tableName: this.tableName }, 'CheckpointManager initialized');
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
          ttl: Math.floor(Date.now() / 1000) + config.storage.ttl,
        },
      });

      await this.client.send(command);

      logger.info(
        {
          shardId: checkpoint.shardId,
          sequenceNumber: checkpoint.sequenceNumber,
          recordCount: checkpoint.recordCount,
        },
        'Checkpoint saved'
      );
    } catch (error) {
      logger.error(
        {
          shardId: checkpoint.shardId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to save checkpoint'
      );
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
        logger.debug({ shardId }, 'No checkpoint found');
        return null;
      }

      const checkpoint: Checkpoint = {
        shardId: result.Item.shardId as string,
        sequenceNumber: result.Item.sequenceNumber as string,
        timestamp: result.Item.timestamp as number,
        recordCount: result.Item.recordCount as number,
      };

      logger.debug({ checkpoint }, 'Checkpoint retrieved');
      return checkpoint;
    } catch (error) {
      logger.error(
        {
          shardId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to get checkpoint'
      );
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
      logger.info({ shardId }, 'Checkpoint deleted');
    } catch (error) {
      logger.error(
        {
          shardId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to delete checkpoint'
      );
      throw error;
    }
  }
}

/**
 * In-memory checkpoint manager for local development/testing
 */
export class InMemoryCheckpointManager implements ICheckpointManager {
  private checkpoints: Map<string, Checkpoint> = new Map();

  saveCheckpoint(checkpoint: Checkpoint): Promise<void> {
    this.checkpoints.set(checkpoint.shardId, checkpoint);
    logger.info(
      {
        shardId: checkpoint.shardId,
        sequenceNumber: checkpoint.sequenceNumber,
      },
      'Checkpoint saved (in-memory)'
    );
    return Promise.resolve();
  }

  getCheckpoint(shardId: string): Promise<Checkpoint | null> {
    const checkpoint = this.checkpoints.get(shardId);
    return Promise.resolve(checkpoint ? checkpoint : null);
  }

  deleteCheckpoint(shardId: string): Promise<void> {
    this.checkpoints.delete(shardId);
    logger.info({ shardId }, 'Checkpoint deleted (in-memory)');
    return Promise.resolve();
  }

  clear(): void {
    this.checkpoints.clear();
  }
}

// Factory function
export function createCheckpointManager(): ICheckpointManager {
  if (config.storage.type === 'dynamodb') {
    return new CheckpointManager();
  }
  return new InMemoryCheckpointManager();
}
