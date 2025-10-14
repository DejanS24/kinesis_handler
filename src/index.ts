import { config } from 'dotenv';
import { KinesisStreamEvent, Context, KinesisStreamBatchResponse } from 'aws-lambda';
import { UserLimitService } from './user-limit/services/user-limit-service';
import { createUserLimitRepository } from './user-limit/repositories/repository-factory';
import { createCheckpointManager } from './utils/checkpointing';
import { dlqHandler } from './utils/dlq';
import { KinesisHandler } from './handlers/kinesis-handler';
import { logger } from './infrastructure/logger';
import { UserLimitEventProcessor } from './processors/user-limit-event-processor';

config();

const repository = createUserLimitRepository();
const userLimitService = new UserLimitService(repository);
const userLimitEventProcessor = new UserLimitEventProcessor(userLimitService);
const checkpointManager = createCheckpointManager();

const kinesisHandler = new KinesisHandler([userLimitEventProcessor], checkpointManager, dlqHandler);

export const functionHandler = async (
  event: KinesisStreamEvent,
  _context: Context
): Promise<KinesisStreamBatchResponse> => {
  logger.info({ eventSource: 'kinesis', recordCount: event.Records.length }, 'Handler invoked');

  try {
    return await kinesisHandler.processBatch(event.Records);
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Fatal error in Lambda handler'
    );
    throw error;
  }
};
