import { IUserLimitRepository, InMemoryUserLimitRepository } from './user-limit-repository';
import { DynamoDBUserLimitRepository } from './dynamodb-user-limit-repository';
import { createChildLogger } from '../../utils/logger';

const logger = createChildLogger({ service: 'repository-factory' });

export type RepositoryType = 'inmemory' | 'dynamodb';

/**
 * Factory function to create UserLimitRepository based on environment configuration
 *
 * Environment Variables:
 * - REPOSITORY_TYPE: 'inmemory' | 'dynamodb' (default: 'inmemory')
 * - USER_LIMIT_TABLE_NAME: DynamoDB table name (required if using dynamodb)
 */
export function createUserLimitRepository(): IUserLimitRepository {
  const repositoryType = (process.env.REPOSITORY_TYPE || 'inmemory').toLowerCase() as RepositoryType;

  if (repositoryType === 'dynamodb') {
    const tableName = process.env.USER_LIMIT_TABLE_NAME;
    if (!tableName) {
      logger.warn({}, 'USER_LIMIT_TABLE_NAME not set, falling back to default');
    }
    return new DynamoDBUserLimitRepository(tableName);
  }

  if (repositoryType !== 'inmemory') {
    logger.warn({ repositoryType }, 'Unknown repository type, falling back to inmemory');
  }

  return new InMemoryUserLimitRepository();
}
