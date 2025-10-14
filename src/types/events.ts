import { EventType } from '../user-limit/models/events';

// Validated event data structure (from yup validation + actual event.json)
export interface ValidatedEventData {
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
