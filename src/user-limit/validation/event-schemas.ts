import * as yup from 'yup';
import { EventType } from '../models/events';
import { ValidatedEventData } from '../../types/events';

const baseEventSchema = yup.object({
  eventId: yup.string().required(),
  eventType: yup.string().oneOf(Object.values(EventType)).required(),
  timestamp: yup.string().required(),
  userId: yup.string().required(),
});

const userLimitCreatedSchema = baseEventSchema.shape({
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

const userLimitProgressChangedSchema = baseEventSchema.shape({
  userLimitId: yup.string().required(),
  amount: yup.string().required(),
  previousProgress: yup.string().optional(),
  brandId: yup.string().required(),
  currencyCode: yup.string().required(),
  nextResetTime: yup.number().optional(),
  remainingAmount: yup.string().optional(),
});

const userLimitResetSchema = baseEventSchema.shape({
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

const schemaRegistry: Record<EventType, yup.AnyObjectSchema> = {
  [EventType.USER_LIMIT_CREATED]: userLimitCreatedSchema,
  [EventType.USER_LIMIT_PROGRESS_CHANGED]: userLimitProgressChangedSchema,
  [EventType.USER_LIMIT_RESET]: userLimitResetSchema,
};

export async function validateEvent(data: unknown): Promise<{
  isValid: boolean;
  eventType?: EventType;
  validatedData?: ValidatedEventData;
  error?: string;
}> {
  try {
    const partial = await baseEventSchema.validate(data, { abortEarly: false });
    const eventType = partial.eventType as EventType;

    const schema = schemaRegistry[eventType];
    if (!schema) {
      return {
        isValid: false,
        error: `Unknown event type: ${String(eventType)}`,
      };
    }

    const validatedData = await schema.validate(data, { abortEarly: false }) as ValidatedEventData;

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
      error: (error as Error).message,
    };
  }
}
