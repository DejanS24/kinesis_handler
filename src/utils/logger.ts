import pino from 'pino';

const logLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();

export const logger = pino({
  level: logLevel,
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
});

export function createChildLogger(context: Record<string, unknown>): pino.Logger {
  return logger.child(context);
}
