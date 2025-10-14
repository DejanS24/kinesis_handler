import { ValidatedEventData } from '../types/events';

export interface EventProcessor {
  canHandle(eventType: string): boolean;
  processEvent(event: ValidatedEventData): Promise<void>;
}
