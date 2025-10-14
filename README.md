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
npm run start:local
```

## Architecture & Design Decisions

### Core Components

**KinesisHandler** - serves as the main Lambda entry point. It's primary role is to orchestrate batch processing with configurable concurrency. Partial batch failure handling is implemented, allowing Lambda to automatically retry only the failed records.<br/>
**Event Processors** are implemented to enable further expansion, and currently the only processor implemented is `UserLimitEventProcessor`.<br/>
**Repository Layer** is added in order to separate storage concern from the rest of the code. Here, we have in-memory storage implementation, which is used for local testing. DynamoDB repository stub is added just to showcase the possible switch. `REPOSITORY_TYPE` env var dictates which storage type will be used.


### Kinesis Features Applied

The implementation leverages several key Kinesis features to ensure robust processing.<br/>
**Partial Batch Failure Handling** is implemented by returning `batchItemFailures` with sequence numbers, which instructs Lambda to automatically retry only the failed records, preventing the unnecessary reprocessing of successful ones.<br/>
**Checkpointing** tracks the last successfully processed sequence number per shard, enabling processing to resume correctly after a Lambda restart. Currently, this uses an in-memory implementation (`InMemoryCheckpointManager`), but a Factory pattern is in place for an eventual DynamoDB checkpoint manager.<br/>
**Concurrency Control** is managed using the `p-limit` library, preventing the service from overwhelming downstream dependencies. This limit is configurable via the `KINESIS_MAX_CONCURRENCY` setting.

### Reliability Features

The system incorporates several features to ensure high reliability.<br/>
**Retry with Backoff** utility uses an exponential backoff strategy (e.g., $100\text{ms} \to 500\text{ms} \to 1000\text{ms}$) and can distinguish between **retryable errors** (like network or throttling issues) and **non-retryable errors** (like validation failures). The maximum attempts per record are configurable.<br/>
**Idempotency Tracking** uses an in-memory mechanism to deduplicate events based on the `eventId` and `userId`, effectively mitigating duplicate processing caused by Kinesis's at-least-once delivery guarantee, with an automatic Time-to-Live (TTL) cleanup.<br/>
**Dead Letter Queue (DLQ)** utility ensures that records that fail after exhausting all retry attempts are sent to an SQS queue. These messages include critical information such as the error details, attempt count, and a correlation ID, and are sent using efficient batch operations.

### Schema Validation

**Yup-based validation**
- Strict schema validation for all incoming events
- Type-safe event models
- Validation failures are non-retryable (logged and skipped)

### Logging Strategy

Uses **Pino structured logging** for high performance, replacing the AWS Lambda Powertools Logger. Logs are output as JSON, and log levels are displayed as strings (INFO, WARN, ERROR). The approach is streamlined, focusing only on logging errors and important state changes.<br/>
**Correlation IDs** are used for request tracing, along with context-aware child loggers for different services, and the log verbosity is configurable via the `LOG_LEVEL` environment variable.


## Additional Questions & Answers

1. Q: What did you like about the task and what didn’t? Can we improve it and how?<br />
A: What I liked the most about this task is the focus on Kinesis, and that I had the opportunity to explore its capabilities. As the assignment scenario is matching the use cases from the actual project, it's a very nice introduction to the domain and the technology used. As for improvements, mentioning some more specific business rules in order to guide edge case resolutions could be helpful, but if the idea was to think of those independently, then it's understandable. The freedom to approach design and implementation is nice, although it resulted in some uncertainty with what I should focus on and how far to go with this task.
2. Q: If you were asked to change it so the `UserLimit` entries are stored on a database
with a primary goal to provide them back to the front-end for display, which one
would you suggest and why? What sub-tasks you would see as a necessary if you
were asked to write a story for such change?<br />
A: The most obvious one, to suggest, is DynamoDB. 
3. Q: What would you suggest for an API to return this data to front-end for a user? What
would be the API signature?<br />
A: 

4. Q: How did/could you implement it so it’s possible to re-use it for other similar use
cases?<br />
