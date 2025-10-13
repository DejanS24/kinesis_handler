/**
 * CloudWatch Embedded Metrics Format (EMF) Helper
 *
 * This utility uses EMF to publish custom metrics to CloudWatch without requiring AWS SDK.
 * Metrics are logged as structured JSON and automatically parsed by CloudWatch Logs.
 *
 * Documentation: https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format.html
 */

export enum MetricUnit {
  Seconds = 'Seconds',
  Microseconds = 'Microseconds',
  Milliseconds = 'Milliseconds',
  Count = 'Count',
  Percent = 'Percent',
  None = 'None',
}

export enum MetricName {
  EventsProcessed = 'EventsProcessed',
  EventsFailed = 'EventsFailed',
  ValidationErrors = 'ValidationErrors',
  ProcessingDuration = 'ProcessingDuration',
  RepositoryOperationDuration = 'RepositoryOperationDuration',
  RetryAttempts = 'RetryAttempts',
}

interface MetricDefinition {
  Name: string;
  Unit: MetricUnit;
}

interface EMFLog {
  _aws: {
    Timestamp: number;
    CloudWatchMetrics: Array<{
      Namespace: string;
      Dimensions: Array<string[]>;
      Metrics: MetricDefinition[];
    }>;
  };
  [key: string]: unknown;
}

export class MetricsHelper {
  private namespace: string;
  private dimensions: Record<string, string>;

  constructor(namespace = 'KinesisHandler', dimensions: Record<string, string> = {}) {
    this.namespace = namespace;
    this.dimensions = { Service: 'UserLimitService', ...dimensions };
  }

  /**
   * Publish a metric to CloudWatch using EMF
   */
  publishMetric(
    metricName: MetricName,
    value: number,
    unit: MetricUnit = MetricUnit.Count,
    additionalDimensions: Record<string, string> = {}
  ): void {
    const dimensions = { ...this.dimensions, ...additionalDimensions };
    const dimensionKeys = Object.keys(dimensions);

    const emfLog: EMFLog = {
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: this.namespace,
            Dimensions: [dimensionKeys],
            Metrics: [
              {
                Name: metricName,
                Unit: unit,
              },
            ],
          },
        ],
      },
      ...dimensions,
      [metricName]: value,
    };

    // Log to stdout - CloudWatch Logs will parse this automatically
    console.log(JSON.stringify(emfLog));
  }

  /**
   * Track event processing success
   */
  recordEventProcessed(eventType: string, correlationId?: string): void {
    this.publishMetric(MetricName.EventsProcessed, 1, MetricUnit.Count, {
      EventType: eventType,
      ...(correlationId && { CorrelationId: correlationId }),
    });
  }

  /**
   * Track event processing failure
   */
  recordEventFailed(eventType: string, errorType: string, correlationId?: string): void {
    this.publishMetric(MetricName.EventsFailed, 1, MetricUnit.Count, {
      EventType: eventType,
      ErrorType: errorType,
      ...(correlationId && { CorrelationId: correlationId }),
    });
  }

  /**
   * Track validation errors
   */
  recordValidationError(eventType?: string): void {
    this.publishMetric(MetricName.ValidationErrors, 1, MetricUnit.Count, {
      ...(eventType && { EventType: eventType }),
    });
  }

  /**
   * Track processing duration
   */
  recordProcessingDuration(durationMs: number, eventType: string): void {
    this.publishMetric(MetricName.ProcessingDuration, durationMs, MetricUnit.Milliseconds, {
      EventType: eventType,
    });
  }

  /**
   * Track repository operation duration
   */
  recordRepositoryOperation(operation: string, durationMs: number, success: boolean): void {
    this.publishMetric(MetricName.RepositoryOperationDuration, durationMs, MetricUnit.Milliseconds, {
      Operation: operation,
      Success: String(success),
    });
  }

  /**
   * Track retry attempts
   */
  recordRetryAttempt(operation: string, attemptNumber: number): void {
    this.publishMetric(MetricName.RetryAttempts, attemptNumber, MetricUnit.Count, {
      Operation: operation,
    });
  }

  /**
   * Helper to measure and record duration
   */
  async measureDuration<T>(
    fn: () => Promise<T>,
    metricName: MetricName,
    dimensions: Record<string, string> = {}
  ): Promise<T> {
    const startTime = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      this.publishMetric(metricName, duration, MetricUnit.Milliseconds, dimensions);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.publishMetric(metricName, duration, MetricUnit.Milliseconds, {
        ...dimensions,
        Success: 'false',
      });
      throw error;
    }
  }
}

// Singleton instance
export const metrics = new MetricsHelper();
