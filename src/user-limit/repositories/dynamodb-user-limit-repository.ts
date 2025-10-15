import { UserLimit } from '../models/user-limit';
import { IUserLimitRepository } from './user-limit-repository';
import { createChildLogger } from '../../utils/logger';
import { NotImplementedError } from '../../types/errors';

const logger = createChildLogger({ service: 'dynamodb-user-limit-repository' });

// Mock up of DynamoDB implementation of IUserLimitRepository
// Next steps:
// run - npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
// create DynamoDB table with proper schema and configure credentials
// implement the methods
export class DynamoDBUserLimitRepository implements IUserLimitRepository {
  private tableName: string;

  constructor(tableName?: string) {
    this.tableName = tableName || process.env.USER_LIMIT_TABLE_NAME || 'UserLimits';

    logger.warn(
      { tableName: this.tableName },
      'DynamoDBUserLimitRepository is not implemented - use REPOSITORY_TYPE=inmemory instead'
    );
  }

  save(_userLimit: UserLimit): Promise<void> {
    throw new NotImplementedError(
      'DynamoDBUserLimitRepository not implemented - use REPOSITORY_TYPE=inmemory'
    );
  }

  findById(_limitId: string): Promise<UserLimit | null> {
    throw new NotImplementedError(
      'DynamoDBUserLimitRepository not implemented - use REPOSITORY_TYPE=inmemory'
    );
  }

  findByUserId(_userId: string): Promise<UserLimit[]> {
    throw new NotImplementedError(
      'DynamoDBUserLimitRepository not implemented - use REPOSITORY_TYPE=inmemory'
    );
  }

  update(_userLimit: UserLimit): Promise<void> {
    throw new NotImplementedError(
      'DynamoDBUserLimitRepository not implemented - use REPOSITORY_TYPE=inmemory'
    );
  }

  delete(_limitId: string): Promise<void> {
    throw new NotImplementedError(
      'DynamoDBUserLimitRepository not implemented - use REPOSITORY_TYPE=inmemory'
    );
  }
}
