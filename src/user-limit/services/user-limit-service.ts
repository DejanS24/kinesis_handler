import { Logger } from '@aws-lambda-powertools/logger';
import { IUserLimitRepository } from '../repositories/user-limit-repository';
import { EventType } from '../models/events';
import { UserLimit, LimitStatus } from '../models/user-limit';

const logger = new Logger({
  logLevel: 'INFO',
  serviceName: 'user-limit-service',
});

// Validated event data structure (from yup validation + actual event.json)
interface ValidatedEventData {
  eventType: EventType;
  userId: string;
  userLimitId?: string;
  brandId?: string;
  type?: string;
  period?: string;
  value?: string;
  currencyCode?: string;
  status?: string;
  activeFrom?: number;
  nextResetTime?: number;
  activeUntil?: number;
  amount?: string;
  previousProgress?: string;
  resetReason?: string;
  [key: string]: unknown;
}

export class UserLimitService {
  constructor(private repository: IUserLimitRepository) {}

  async processEvent(event: ValidatedEventData): Promise<void> {
    logger.info('Processing event', { eventType: event.eventType, userId: event.userId });

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
        throw new Error(`Unknown event type: ${String(event.eventType)}`);
    }
  }

  private async handleLimitCreated(event: ValidatedEventData): Promise<void> {
    if (!event.userLimitId || !event.type || !event.period || !event.value) {
      throw new Error('Missing required fields for USER_LIMIT_CREATED event');
    }

    const now = Date.now();
    const userLimit: UserLimit = {
      userLimitId: event.userLimitId,
      userId: event.userId,
      brandId: event.brandId || '',
      type: event.type as UserLimit['type'],
      period: event.period as UserLimit['period'],
      value: event.value,
      currencyCode: event.currencyCode || 'USD',
      status: (event.status as UserLimit['status']) || LimitStatus.ACTIVE,
      activeFrom: event.activeFrom || now,
      progress: '0',
      createdAt: now,
      nextResetTime: event.nextResetTime,
      activeUntil: event.activeUntil,
    };

    await this.repository.save(userLimit);
    logger.info('User limit created', { userLimitId: userLimit.userLimitId, userId: userLimit.userId });
  }

  private async handleProgressChanged(event: ValidatedEventData): Promise<void> {
    if (!event.userLimitId) {
      throw new Error('Missing userLimitId for USER_LIMIT_PROGRESS_CHANGED event');
    }

    const existingLimit = await this.repository.findById(event.userLimitId);

    if (!existingLimit) {
      throw new Error(`UserLimit with id ${event.userLimitId} not found`);
    }

    // Extract progress from event (could be 'amount', 'previousProgress', or other field)
    const newProgress = event.amount || event.previousProgress || '0';
    const limitValue = parseFloat(existingLimit.value);
    const progressValue = parseFloat(newProgress);

    // Business rule: progress cannot exceed limit
    if (progressValue > limitValue) {
      logger.warn('Progress exceeds limit amount', {
        userLimitId: event.userLimitId,
        progress: progressValue,
        limit: limitValue,
      });
      throw new Error(
        `Progress ${progressValue} exceeds limit ${limitValue} for userLimitId ${event.userLimitId}`
      );
    }

    const updatedLimit: UserLimit = {
      ...existingLimit,
      progress: newProgress,
    };

    await this.repository.update(updatedLimit);
    logger.info('User limit progress updated', {
      userLimitId: event.userLimitId,
      newProgress,
      limitValue,
    });
  }

  private async handleLimitReset(event: ValidatedEventData): Promise<void> {
    if (!event.userLimitId) {
      throw new Error('Missing userLimitId for USER_LIMIT_RESET event');
    }

    const existingLimit = await this.repository.findById(event.userLimitId);

    if (!existingLimit) {
      throw new Error(`UserLimit with id ${event.userLimitId} not found`);
    }

    const updatedLimit: UserLimit = {
      ...existingLimit,
      progress: '0',
      status: LimitStatus.ACTIVE,
      nextResetTime: event.nextResetTime,
    };

    await this.repository.update(updatedLimit);
    logger.info('User limit reset', {
      userLimitId: event.userLimitId,
      resetReason: event.resetReason,
    });
  }
}