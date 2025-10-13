export class RepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RepositoryError';
  }
}

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
