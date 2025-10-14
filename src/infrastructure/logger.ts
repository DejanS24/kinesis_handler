import pino from 'pino';

const logLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();

export const logger = pino({
  level: logLevel,
});

export function createChildLogger(context: Record<string, unknown>) {
  return logger.child(context);
}
