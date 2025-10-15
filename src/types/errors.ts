// Base error classes
export class RepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RepositoryError';
  }
}

export class ServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServiceError';
  }
}

export class HandlerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HandlerError';
  }
}

// Repository-level errors
export class UserLimitNotFoundError extends RepositoryError {
  constructor(limitId: string) {
    super(`UserLimit with id ${limitId} not found`);
    this.name = 'UserLimitNotFoundError';
  }
}

export class UserLimitAlreadyExistsError extends RepositoryError {
  constructor(limitId: string) {
    super(`UserLimit with id ${limitId} already exists`);
    this.name = 'UserLimitAlreadyExistsError';
  }
}

export class InvalidUserLimitError extends RepositoryError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidUserLimitError';
  }
}

export class NotImplementedError extends RepositoryError {
  constructor(message: string) {
    super(message);
    this.name = 'NotImplementedError';
  }
}

// Service-level errors
export class UnknownEventTypeError extends ServiceError {
  constructor(eventType: string) {
    super(`Unknown event type: ${eventType}`);
    this.name = 'UnknownEventTypeError';
  }
}

export class MissingEventFieldError extends ServiceError {
  constructor(eventType: string, fields: string[]) {
    super(`Missing required fields for ${eventType} event: ${fields.join(', ')}`);
    this.name = 'MissingEventFieldError';
  }
}

export class UserLimitExceededError extends ServiceError {
  constructor(userLimitId: string, progress: number, limit: number) {
    super(`Progress ${progress} exceeds limit ${limit} for userLimitId ${userLimitId}`);
    this.name = 'UserLimitExceededError';
  }
}

// Handler-level errors
export class SkippedRecordError extends HandlerError {
  constructor(reason: string) {
    super(reason);
    this.name = 'SkippedRecordError';
  }
}

export class ProcessingError extends HandlerError {
  constructor(
    message: string,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'ProcessingError';
  }
}
