import { createChildLogger } from '../../utils/logger';
import { IUserLimitRepository } from '../repositories/user-limit-repository';
import { EventType } from '../models/events';
import { UserLimit, LimitStatus } from '../models/user-limit';
import {
  UnknownEventTypeError,
  UserLimitNotFoundError,
  UserLimitExceededError,
} from '../../types/errors';
import { ValidatedEventData } from '../../types/events';

const logger = createChildLogger({ service: 'user-limit-service' });

export class UserLimitService {
  constructor(private repository: IUserLimitRepository) {}

  async processEvent(event: ValidatedEventData): Promise<void> {
    switch (event.eventType) {
      case EventType.USER_LIMIT_CREATED:
        await this.handleLimitCreated(event);
        break;
      case EventType.USER_LIMIT_PROGRESS_CHANGED:
        await this.handleProgressChanged(event);
        break;
      case EventType.USER_LIMIT_RESET:
        await this.handleLimitReset(event);
        break;
      default:
        throw new UnknownEventTypeError(String(event.eventType));
    }
  }

  private async handleLimitCreated(event: ValidatedEventData): Promise<void> {
    const now = Date.now();
    const userLimit: UserLimit = {
      userLimitId: event.userLimitId!,
      userId: event.userId,
      brandId: event.brandId || '',
      type: event.type! as UserLimit['type'],
      period: event.period! as UserLimit['period'],
      value: event.value!,
      currencyCode: event.currencyCode || 'USD',
      status: (event.status as UserLimit['status']) || LimitStatus.ACTIVE,
      activeFrom: event.activeFrom || now,
      progress: '0',
      createdAt: now,
      nextResetTime: event.nextResetTime,
      activeUntil: event.activeUntil,
    };

    await this.repository.save(userLimit);
  }

  private async handleProgressChanged(event: ValidatedEventData): Promise<void> {
    const existingLimit = await this.repository.findById(event.userLimitId!);

    if (!existingLimit) {
      throw new UserLimitNotFoundError(event.userLimitId!);
    }

    // Extract progress from event (could be 'amount', 'previousProgress', or other field)
    const newProgress = event.amount || event.previousProgress || '0';
    const limitValue = parseFloat(existingLimit.value);
    const progressValue = parseFloat(newProgress);

    if (progressValue > limitValue) {
      logger.warn(
        {
          userLimitId: event.userLimitId!,
          progress: progressValue,
          limit: limitValue,
        },
        'Progress exceeds limit amount'
      );
      throw new UserLimitExceededError(event.userLimitId!, progressValue, limitValue);
    }

    const updatedLimit: UserLimit = {
      ...existingLimit,
      progress: newProgress,
    };

    await this.repository.update(updatedLimit);
  }

  private async handleLimitReset(event: ValidatedEventData): Promise<void> {
    const existingLimit = await this.repository.findById(event.userLimitId!);

    if (!existingLimit) {
      throw new UserLimitNotFoundError(event.userLimitId!);
    }

    const updatedLimit: UserLimit = {
      ...existingLimit,
      progress: '0',
      status: LimitStatus.ACTIVE,
      nextResetTime: event.nextResetTime,
    };

    await this.repository.update(updatedLimit);
  }
}
