import { readFileSync } from 'fs';
import { resolve } from 'path';
import { KinesisStreamEvent, Context } from 'aws-lambda';
import { functionHandler } from './index';

async function runLocal(): Promise<void> {
  try {
    const eventsPath = resolve(__dirname, '../data/events.json');
    const eventsData = readFileSync(eventsPath, 'utf-8');
    const events = JSON.parse(eventsData) as Array<{
      eventId: string;
      type: string;
      payload: Record<string, unknown>;
      createdAt: number;
      [key: string]: unknown;
    }>;

    console.log(`Loaded ${events.length} events`);

    const kinesisEvent: KinesisStreamEvent = {
      Records: events.map((event, index) => {
        const eventPayload = {
          eventId: event.eventId,
          eventType: event.type,
          timestamp: new Date(event.createdAt).toISOString(),
          userId: event.payload.userId as string,
          ...event.payload,
        };

        // Encode as base64 (simulating Kinesis)
        const data = Buffer.from(JSON.stringify(eventPayload)).toString('base64');

        return {
          kinesis: {
            kinesisSchemaVersion: '1.0',
            partitionKey: event.payload.userId as string,
            sequenceNumber: String(index),
            data,
            approximateArrivalTimestamp: event.createdAt / 1000,
          },
          eventSource: 'aws:kinesis',
          eventVersion: '1.0',
          eventID: `shardId-000000000000:${event.eventId}`,
          eventName: 'aws:kinesis:record',
          invokeIdentityArn: 'arn:aws:iam::123456789012:role/lambda-role',
          awsRegion: 'us-east-1',
          eventSourceARN: 'arn:aws:kinesis:us-east-1:123456789012:stream/test',
        };
      }),
    };

    // Create mock Lambda context
    const context: Context = {
      callbackWaitsForEmptyEventLoop: false,
      functionName: 'local-test',
      functionVersion: '1',
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:local-test',
      memoryLimitInMB: '256',
      awsRequestId: 'local-test-request-id',
      logGroupName: '/aws/lambda/local-test',
      logStreamName: 'local-test-stream',
      getRemainingTimeInMillis: () => 30000,
      done: () => {},
      fail: () => {},
      succeed: () => {},
    };

    // Execute the handler
    console.log('\n--- Starting handler execution ---\n');
    await functionHandler(kinesisEvent, context);
    console.log(`\n--- Handler execution completed successfully ---\n`);
  } catch (error) {
    console.error('Error running local handler:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  runLocal().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { runLocal };
