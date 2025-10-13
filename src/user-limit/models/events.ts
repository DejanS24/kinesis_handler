import { LimitType } from "./user-limit";

export enum EventType {
  USER_LIMIT_CREATED = 'USER_LIMIT_CREATED',
  USER_LIMIT_PROGRESS_CHANGED = 'USER_LIMIT_PROGRESS_CHANGED',
  USER_LIMIT_RESET = 'USER_LIMIT_RESET'
}

export interface BaseEvent {
  eventId: string;
  eventType: EventType;
  timestamp: string;
  userId: string;
}

export interface UserLimitCreatedEvent extends BaseEvent {
  eventType: EventType.USER_LIMIT_CREATED;
  limitType: LimitType;
  limitAmount: number;
  periodType: 'DAY' | 'WEEK' | 'MONTH';
  startDate: string;
}

export interface UserLimitProgressChangedEvent extends BaseEvent {
  eventType: EventType.USER_LIMIT_PROGRESS_CHANGED;
  limitId: string;
  newProgress: number;
  changeAmount: number;
}

export interface UserLimitResetEvent extends BaseEvent {
  eventType: EventType.USER_LIMIT_RESET;
  limitId: string;
  resetReason?: string;
}