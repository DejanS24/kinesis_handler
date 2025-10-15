# Kinesis Handler

AWS Lambda handler for processing Kinesis stream events in TypeScript.

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

# Storage
REPOSITORY_TYPE=inmemory          # 'dynamodb' not yet implemented
USER_LIMIT_TABLE_NAME=UserLimits

# Logging
LOG_LEVEL=info                    # debug, info, warn, error
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

**KinesisHandler** - Main Lambda entry point that orchestrates batch processing. Returns partial batch failures via `batchItemFailures`, enabling AWS Lambda to retry only failed records when properly configured.<br/>
**Event Processors** - Pluggable event routing pattern for extensibility. Currently implements `UserLimitEventProcessor`.<br/>
**Repository Layer** - Separates storage concerns from business logic. In-memory implementation is functional. DynamoDB implementation is stubbed but not yet complete. `REPOSITORY_TYPE` env var controls the storage backend.


### Error Handling

**Validation Errors** - Invalid events are logged and skipped (marked as success) to prevent infinite retries.<br/>
**Business Logic Errors** - Returned as failures via `batchItemFailures`. When AWS Lambda Event Source Mapping is configured with retry settings, these will be automatically retried by AWS infrastructure (not by application code).<br/>

### Schema Validation

**Yup-based validation**
- Strict schema validation for all incoming events
- Type-safe event models
- Validation failures are non-retryable (logged and skipped)

### Logging

**Pino structured logging** - High-performance JSON logging with configurable log levels (INFO, WARN, ERROR). Context-aware child loggers for different services, with log verbosity controlled via `LOG_LEVEL` environment variable.

### Design Principles

1. **Separation of Concerns**: Handler, processors, and repositories are decoupled
2. **AWS-Native Reliability**: Leverages Lambda's built-in retry, DLQ, and concurrency features
3. **Extensibility**: Easy to add new event processors
4. **Observable**: Structured logging with context tracking

## Next Steps

### Not Yet Implemented
- **DynamoDB Repository** - Complete the `DynamoDBUserLimitRepository` stub implementation
- **Infrastructure as Code** - Add CloudFormation/Terraform templates for Lambda, Event Source Mapping, and DynamoDB
- **Dead Letter Queue** - Configure via AWS Lambda Event Source Mapping `DestinationConfig` or implement custom DLQ handling in code
- **Retry Configuration** - Set `MaximumRetryAttempts`, `BisectBatchOnFunctionError`, and `MaximumRecordAgeInSeconds` via Event Source Mapping
- **Storage TTL** - Implement automatic expiration of user limits after configured time period
- **Observability** - Add CloudWatch custom metrics and X-Ray tracing

## Additional Questions & Answers

1. Q: What did you like about the task and what didn’t? Can we improve it and how?<br />
A: What I liked the most about this task is the focus on Kinesis, and that I had the opportunity to explore its capabilities - this was the most enjoyable part of the task. As the assignment scenario is matching the use cases from the actual project, it's a very nice introduction to the domain and the technology used. As for improvements, mentioning some more specific business rules in order to guide edge case resolutions could be helpful, but if the idea was to think of those independently, then it's understandable. The freedom to approach design and implementation is nice, although it resulted in some uncertainty with what I should focus on and how far to go with this task.
2. Q: If you were asked to change it so the `UserLimit` entries are stored on a database
with a primary goal to provide them back to the front-end for display, which one
would you suggest and why? What sub-tasks you would see as a necessary if you
were asked to write a story for such change?<br />
A: The most obvious one, to suggest, is DynamoDB, for the following reasons:
- Performance - DynamoDB offers single-digit millisecond latency, which is ideal for fast, user-facing queries.
- Scalability - automatically adapting to the variable traffic patterns, handling major peaks
- Natural fit with Event Sourcing and stream processing - complementing the existing event-driven design.
- Cost - the pay-per-request pricing model suits variable load, optimizing costs during off-peak times

**Story Sub-tasks:**
- **Schema Design** - Design DynamoDB table schema with partition key (userId) and sort key (limitId)
-  **Repository Implementation** - Build DynamoDBUserLimitRepository implementing the existing interface, setting up DynamoDB client with proper credentials, and implementing all needed functions
-  **Dual-Write Migration** - Implement parallel writes to both in-memory and DynamoDB during transition
- **Migrate existing data** - Migrate existing limits from current storage
- **Performance Testing** - Load test with expected requests/sec peak traffic
-  **Monitoring Setup** - CloudWatch dashboards, alarms for throttling, X-Ray tracing
- **Rollback Plan** - Feature flags for instant reversion if issues arise


3. Q: What would you suggest for an API to return this data to front-end for a user? What
would be the API signature?<br />
A: 
```// RESTful API
GET /api/v1/users/{userId}/limits
Response: UserLimit[]

GET /api/v1/users/{userId}/limits/{limitId}
Response: UserLimit

GET /api/v1/users/{userId}/limits/active?type={limitType}&period={period}
Response: UserLimit[]

```

**Response Format Example**
```json
{
  "data": {
    "limitId": "lmt_123",
    "userId": "usr_456",
    "type": "DEPOSIT",
    "amount": 1000,
    "progress": 750,
    "percentage": 75,
    "remainingAmount": 250,
    "status": "ACTIVE",
    "periodType": "DAILY",
    "expiresAt": "2024-01-15T23:59:59Z"
  },
  "meta": {
    "version": 1,
    "lastUpdated": "2024-01-15T14:30:00Z"
  }
}
```
4. Q: How did/could you implement it so it's possible to re-use it for other similar use cases?<br />
A: Reusable components can be seen with Processors layer, where we have `event-processor.ts` which enables specific event processors to be registered dynamically. In this project only `UserLimitEventProcessor` is being registered.<br/> Another example is Repository layer impelmentation, where it's made easy to modify storage logic (which database is being used).