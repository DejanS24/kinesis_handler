import { UserLimit } from '../models/user-limit';
import {
  UserLimitNotFoundError,
  UserLimitAlreadyExistsError,
  InvalidUserLimitError,
} from '../../types/errors';

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

  // eslint-disable-next-line @typescript-eslint/require-await
  async save(userLimit: UserLimit): Promise<void> {
    if (this.limits.has(userLimit.userLimitId)) {
      throw new UserLimitAlreadyExistsError(userLimit.userLimitId);
    }

    this.limits.set(userLimit.userLimitId, userLimit);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async findById(limitId: string): Promise<UserLimit | null> {
    if (!limitId || limitId.trim() === '') {
      throw new InvalidUserLimitError('limitId cannot be empty');
    }

    const limit = this.limits.get(limitId);
    return limit ? limit : null;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async findByUserId(userId: string): Promise<UserLimit[]> {
    if (!userId || userId.trim() === '') {
      throw new InvalidUserLimitError('userId cannot be empty');
    }

    const limitIds = this.userIdIndex.get(userId);
    if (!limitIds || limitIds.size === 0) {
      return [];
    }

    const userLimits: UserLimit[] = [];
    for (const limitId of limitIds) {
      const limit = this.limits.get(limitId);
      if (limit) userLimits.push(limit);
    }

    return userLimits;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async update(userLimit: UserLimit): Promise<void> {
    this.validateUserLimit(userLimit);

    if (!this.limits.has(userLimit.userLimitId)) {
      throw new UserLimitNotFoundError(userLimit.userLimitId);
    }

    this.limits.set(userLimit.userLimitId, userLimit);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async delete(limitId: string): Promise<void> {
    if (!limitId || limitId.trim() === '') {
      throw new InvalidUserLimitError('limitId cannot be empty');
    }

    const limit = this.limits.get(limitId);
    if (!limit) {
      throw new UserLimitNotFoundError(limitId);
    }

    this.limits.delete(limitId);
  }
}