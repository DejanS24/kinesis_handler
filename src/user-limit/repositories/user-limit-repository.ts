import { Logger } from '@aws-lambda-powertools/logger';
import { UserLimit } from '../models/user-limit';
import {
  UserLimitNotFoundError,
  UserLimitAlreadyExistsError,
  InvalidUserLimitError,
} from '../../types/errors';

const logger = new Logger({
  logLevel: 'INFO',
  serviceName: 'user-limit-repository',
});

export interface IUserLimitRepository {
  save(userLimit: UserLimit): Promise<void>;
  findById(limitId: string): Promise<UserLimit | null>;
  findByUserId(userId: string): Promise<UserLimit[]>;
  update(userLimit: UserLimit): Promise<void>;
  delete(limitId: string): Promise<void>;
}

export class InMemoryUserLimitRepository implements IUserLimitRepository {
  private limits: Map<string, UserLimit> = new Map();
  private userIdIndex: Map<string, Set<string>> = new Map();

  async save(userLimit: UserLimit): Promise<void> {
    this.validateUserLimit(userLimit);

    if (this.limits.has(userLimit.userLimitId)) {
      logger.warn('Attempted to save existing UserLimit', { userLimitId: userLimit.userLimitId });
      throw new UserLimitAlreadyExistsError(userLimit.userLimitId);
    }

    this.limits.set(userLimit.userLimitId, userLimit);

    logger.info('UserLimit saved', {
      userLimitId: userLimit.userLimitId,
      userId: userLimit.userId,
    });
  }

  async findById(limitId: string): Promise<UserLimit | null> {
    if (!limitId || limitId.trim() === '') {
      throw new InvalidUserLimitError('limitId cannot be empty');
    }

    const limit = this.limits.get(limitId);
    logger.debug('UserLimit lookup by id', { limitId, found: !!limit });
    return limit ? limit : null;
  }

  async findByUserId(userId: string): Promise<UserLimit[]> {
    if (!userId || userId.trim() === '') {
      throw new InvalidUserLimitError('userId cannot be empty');
    }

    const limitIds = this.userIdIndex.get(userId);
    if (!limitIds || limitIds.size === 0) {
      logger.debug('No UserLimits found for user', { userId });
      return [];
    }

    const userLimits: UserLimit[] = [];
    for (const limitId of limitIds) {
      const limit = this.limits.get(limitId);
      if (limit) userLimits.push(limit);
    }

    logger.debug('UserLimits found for user', { userId, count: userLimits.length });
    return userLimits;
  }

  async update(userLimit: UserLimit): Promise<void> {
    this.validateUserLimit(userLimit);

    if (!this.limits.has(userLimit.userLimitId)) {
      logger.warn('Attempted to update non-existent UserLimit', {
        userLimitId: userLimit.userLimitId,
      });
      throw new UserLimitNotFoundError(userLimit.userLimitId);
    }

    this.limits.set(userLimit.userLimitId, userLimit);

    logger.info('UserLimit updated', {
      userLimitId: userLimit.userLimitId,
      userId: userLimit.userId,
    });
  }

  async delete(limitId: string): Promise<void> {
    if (!limitId || limitId.trim() === '') {
      throw new InvalidUserLimitError('limitId cannot be empty');
    }

    const limit = this.limits.get(limitId);
    if (!limit) {
      logger.warn('Attempted to delete non-existent UserLimit', { limitId });
      throw new UserLimitNotFoundError(limitId);
    }

    this.limits.delete(limitId);

    logger.info('UserLimit deleted', { limitId, userId: limit.userId });
  }

  private validateUserLimit(userLimit: UserLimit): void {
    if (!userLimit.userLimitId || userLimit.userLimitId.trim() === '') {
      throw new InvalidUserLimitError('userLimitId cannot be empty');
    }
    if (!userLimit.userId || userLimit.userId.trim() === '') {
      throw new InvalidUserLimitError('userId cannot be empty');
    }
  }
}