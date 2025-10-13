export interface Config {
  aws: {
    region: string;
    kinesis: {
      maxRetries: number;
      batchSize: number;
      concurrency: number;
    };
    sqs: {
      dlqUrl: string;
    };
    dynamodb: {
      checkpointTable: string;
      userLimitTable: string;
    };
  };
  storage: {
    type: 'inmemory' | 'dynamodb';
    ttl: number;
  };
  rateLimiting: {
    maxRequestsPerSecond: number;
  };
  logging: {
    level: string;
  };
  idempotency: {
    ttlMs: number;
  };
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function getEnvString(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export const config: Config = {
  aws: {
    region: getEnvString('AWS_REGION', 'us-east-1'),
    kinesis: {
      maxRetries: getEnvNumber('KINESIS_MAX_RETRIES', 3),
      batchSize: getEnvNumber('KINESIS_BATCH_SIZE', 10),
      concurrency: getEnvNumber('KINESIS_MAX_CONCURRENCY', 10),
    },
    sqs: {
      dlqUrl: getEnvString('DLQ_URL', ''),
    },
    dynamodb: {
      checkpointTable: getEnvString('CHECKPOINT_TABLE', 'kinesis-checkpoints'),
      userLimitTable: getEnvString('USER_LIMIT_TABLE_NAME', 'UserLimits'),
    },
  },
  storage: {
    type: (getEnvString('REPOSITORY_TYPE', 'inmemory') as 'inmemory' | 'dynamodb'),
    ttl: getEnvNumber('STORAGE_TTL', 3600),
  },
  rateLimiting: {
    maxRequestsPerSecond: getEnvNumber('RATE_LIMIT', 100),
  },
  logging: {
    level: getEnvString('LOG_LEVEL', 'info'),
  },
  idempotency: {
    ttlMs: getEnvNumber('IDEMPOTENCY_TTL_MS', 3600000), // 1 hour
  },
};

export function validateConfig(): void {
  const errors: string[] = [];

  if (config.storage.type === 'dynamodb' && !config.aws.dynamodb.userLimitTable) {
    errors.push('USER_LIMIT_TABLE_NAME is required when REPOSITORY_TYPE=dynamodb');
  }

  if (config.aws.sqs.dlqUrl && !config.aws.sqs.dlqUrl.startsWith('https://sqs.')) {
    errors.push('DLQ_URL must be a valid SQS queue URL');
  }

  if (config.aws.kinesis.batchSize < 1 || config.aws.kinesis.batchSize > 10000) {
    errors.push('KINESIS_BATCH_SIZE must be between 1 and 10000');
  }

  if (config.aws.kinesis.concurrency < 1) {
    errors.push('KINESIS_MAX_CONCURRENCY must be at least 1');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}
