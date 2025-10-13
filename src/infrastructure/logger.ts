import pino from 'pino';
import { config } from '../config';


const logLevel = config.logging.level.toLowerCase();

export const logger = pino({
  level: logLevel,
});

export function createChildLogger(context: Record<string, unknown>) {
  return logger.child(context);
}
