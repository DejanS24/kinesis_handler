import pino from 'pino';
import { config } from '../config';

/**
 * Pino logger configuration for high-performance structured logging
 *
 * Features:
 * - JSON structured output
 * - Configurable log level via environment
 * - Optimized for Lambda (no file transport needed)
 * - Correlation ID support via child loggers
 */

const logLevel = config.logging.level.toLowerCase();

export const logger = pino({
  level: logLevel,
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: 'kinesis-stream-handler',
  },
});

/**
 * Create a child logger with additional context
 * Useful for adding correlation IDs or other request-specific data
 */
export function createChildLogger(context: Record<string, unknown>) {
  return logger.child(context);
}
