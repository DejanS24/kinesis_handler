import { EventProcessor } from './event-processor';
import { UserLimitService } from '../user-limit/services/user-limit-service';
import { EventType } from '../user-limit/models/events';
import { ValidatedEventData } from '../types/events';

export class UserLimitEventProcessor implements EventProcessor {
  private readonly supportedEventTypes = [
    EventType.USER_LIMIT_CREATED,
    EventType.USER_LIMIT_PROGRESS_CHANGED,
    EventType.USER_LIMIT_RESET,
  ];

  constructor(private userLimitService: UserLimitService) {}

  canHandle(eventType: string): boolean {
    return this.supportedEventTypes.includes(eventType as EventType);
  }

  async processEvent(event: ValidatedEventData): Promise<void> {
    await this.userLimitService.processEvent(event);
  }
}
