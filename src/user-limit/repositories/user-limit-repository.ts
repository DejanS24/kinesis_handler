import { UserLimit } from '../models/user-limit';
import {
  UserLimitNotFoundError,
  UserLimitAlreadyExistsError,
  InvalidUserLimitError,
} from '../../types/errors';
import { createChildLogger } from '../../infrastructure/logger';

const logger = createChildLogger({ service: 'user-limit-repository' });

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
      logger.warn({ userLimitId: userLimit.userLimitId }, 'Attempted to save existing UserLimit');
      throw new UserLimitAlreadyExistsError(userLimit.userLimitId);
    }

    this.limits.set(userLimit.userLimitId, userLimit);

    logger.info(
      {
        userLimitId: userLimit.userLimitId,
        userId: userLimit.userId,
      },
      'UserLimit saved'
    );
  }

  async findById(limitId: string): Promise<UserLimit | null> {
    if (!limitId || limitId.trim() === '') {
      throw new InvalidUserLimitError('limitId cannot be empty');
    }

    const limit = this.limits.get(limitId);
    logger.debug({ limitId, found: !!limit }, 'UserLimit lookup by id');
    return limit ? limit : null;
  }

  async findByUserId(userId: string): Promise<UserLimit[]> {
    if (!userId || userId.trim() === '') {
      throw new InvalidUserLimitError('userId cannot be empty');
    }

    const limitIds = this.userIdIndex.get(userId);
    if (!limitIds || limitIds.size === 0) {
      logger.debug({ userId }, 'No UserLimits found for user');
      return [];
    }

    const userLimits: UserLimit[] = [];
    for (const limitId of limitIds) {
      const limit = this.limits.get(limitId);
      if (limit) userLimits.push(limit);
    }

    logger.debug({ userId, count: userLimits.length }, 'UserLimits found for user');
    return userLimits;
  }

  async update(userLimit: UserLimit): Promise<void> {
    this.validateUserLimit(userLimit);

    if (!this.limits.has(userLimit.userLimitId)) {
      logger.warn(
        {
          userLimitId: userLimit.userLimitId,
        },
        'Attempted to update non-existent UserLimit'
      );
      throw new UserLimitNotFoundError(userLimit.userLimitId);
    }

    this.limits.set(userLimit.userLimitId, userLimit);

    logger.info(
      {
        userLimitId: userLimit.userLimitId,
        userId: userLimit.userId,
      },
      'UserLimit updated'
    );
  }

  async delete(limitId: string): Promise<void> {
    if (!limitId || limitId.trim() === '') {
      throw new InvalidUserLimitError('limitId cannot be empty');
    }

    const limit = this.limits.get(limitId);
    if (!limit) {
      logger.warn({ limitId }, 'Attempted to delete non-existent UserLimit');
      throw new UserLimitNotFoundError(limitId);
    }

    this.limits.delete(limitId);

    logger.info({ limitId, userId: limit.userId }, 'UserLimit deleted');
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