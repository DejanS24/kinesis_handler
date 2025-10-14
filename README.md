# Kinesis Handler

Production-ready AWS Lambda handler for processing Kinesis stream events in TypeScript.

## Installation & Getting Started

### Prerequisites
- Node.js 20+
- npm

### Setup

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Lint
npm run lint
```

### Configuration

Set environment variables (or use defaults):

```bash
# AWS Configuration
AWS_REGION=us-east-1

# Kinesis Settings
KINESIS_MAX_RETRIES=3
KINESIS_BATCH_SIZE=10
KINESIS_MAX_CONCURRENCY=10

# Storage
REPOSITORY_TYPE=inmemory          # or 'dynamodb'
USER_LIMIT_TABLE_NAME=UserLimits
CHECKPOINT_TABLE=kinesis-checkpoints
STORAGE_TTL=3600                  # seconds

# DLQ
DLQ_URL=https://sqs.us-east-1.amazonaws.com/...

# Logging
LOG_LEVEL=info                    # debug, info, warn, error

# Idempotency
IDEMPOTENCY_TTL_MS=3600000       # 1 hour
```

### Running Locally

Place test events in `data/events.json`:

```json
[
  {
    "eventId": "evt-001",
    "type": "USER_LIMIT_CREATED",
    "payload": {
      "userId": "user-123",
      "userLimitId": "limit-001",
      "name": "Daily API Requests",
      "maxValue": 1000
    },
    "createdAt": 1234567890000
  }
]
```

Run the handler:

```bash
# Quick run (no build)
npm run start:local:tsx

# Or with pretty logs
npm run start:local:tsx | npx pino-pretty
```

## Architecture & Design Decisions

*To be added*

## Additional Questions & Answers

*To be added*
