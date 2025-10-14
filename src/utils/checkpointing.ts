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
 * In-memory checkpoint manager for local development/testing
 */
export class InMemoryCheckpointManager implements ICheckpointManager {
  private checkpoints: Map<string, Checkpoint> = new Map();

  saveCheckpoint(checkpoint: Checkpoint): Promise<void> {
    this.checkpoints.set(checkpoint.shardId, checkpoint);
    return Promise.resolve();
  }

  getCheckpoint(shardId: string): Promise<Checkpoint | null> {
    const checkpoint = this.checkpoints.get(shardId);
    return Promise.resolve(checkpoint ? checkpoint : null);
  }

  deleteCheckpoint(shardId: string): Promise<void> {
    this.checkpoints.delete(shardId);
    return Promise.resolve();
  }

  clear(): void {
    this.checkpoints.clear();
  }
}

// Factory function
export function createCheckpointManager(): ICheckpointManager | undefined {
  const storageType = (process.env.REPOSITORY_TYPE || 'inmemory').toLowerCase();
  if (storageType === 'dynamodb') {
    return undefined;
  }
  return new InMemoryCheckpointManager();
}
