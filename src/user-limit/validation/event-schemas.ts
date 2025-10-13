import * as yup from 'yup';
import { EventType } from '../models/events';

const baseEventSchema = yup.object({
  eventId: yup.string().required(),
  eventType: yup.string().oneOf(Object.values(EventType)).required(),
  timestamp: yup.string().required(),
  userId: yup.string().required(),
});

export const userLimitCreatedSchema = baseEventSchema.shape({
  eventType: yup.string().oneOf([EventType.USER_LIMIT_CREATED]).required(),
  userLimitId: yup.string().required(),
  type: yup.string().required(),
  period: yup.string().required(),
  value: yup.string().required(),
  currencyCode: yup.string().required(),
  status: yup.string().required(),
  activeFrom: yup.number().required(),
  brandId: yup.string().required(),
  nextResetTime: yup.number().optional(),
  activeUntil: yup.number().optional(),
});

export const userLimitProgressChangedSchema = baseEventSchema.shape({
  eventType: yup.string().oneOf([EventType.USER_LIMIT_PROGRESS_CHANGED]).required(),
  userLimitId: yup.string().required(),
  amount: yup.string().required(),
  previousProgress: yup.string().optional(),
  brandId: yup.string().required(),
  currencyCode: yup.string().required(),
  nextResetTime: yup.number().optional(),
  remainingAmount: yup.string().optional(),
});

export const userLimitResetSchema = baseEventSchema.shape({
  eventType: yup.string().oneOf([EventType.USER_LIMIT_RESET]).required(),
  userLimitId: yup.string().required(),
  type: yup.string().required(),
  period: yup.string().required(),
  brandId: yup.string().required(),
  currencyCode: yup.string().required(),
  nextResetTime: yup.number().optional(),
  resetAmount: yup.string().optional(),
  resetPercentage: yup.string().optional(),
  unusedAmount: yup.string().optional(),
});

export async function validateEvent(data: unknown): Promise<{
  isValid: boolean;
  eventType?: EventType;
  validatedData?: unknown;
  error?: string;
}> {
  try {
    // First check if it has an eventType
    const partial = await yup
      .object({
        eventType: yup.string().oneOf(Object.values(EventType)).required(),
      })
      .validate(data, { abortEarly: false });

    const eventType = partial.eventType as EventType;

    // Validate based on event type
    let validatedData;
    switch (eventType) {
      case EventType.USER_LIMIT_CREATED:
        validatedData = await userLimitCreatedSchema.validate(data, { abortEarly: false });
        break;
      case EventType.USER_LIMIT_PROGRESS_CHANGED:
        validatedData = await userLimitProgressChangedSchema.validate(data, { abortEarly: false });
        break;
      case EventType.USER_LIMIT_RESET:
        validatedData = await userLimitResetSchema.validate(data, { abortEarly: false });
        break;
      default:
        return {
          isValid: false,
          error: `Unknown event type: ${eventType}`,
        };
    }

    return {
      isValid: true,
      eventType,
      validatedData,
    };
  } catch (error) {
    if (error instanceof yup.ValidationError) {
      return {
        isValid: false,
        error: error.errors.join(', '),
      };
    }
    return {
      isValid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
