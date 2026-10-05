import winston from 'winston';
import { config } from '../config';

export const logger = winston.createLogger({
  level: config.nodeEnv === 'production' ? 'warn' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    config.nodeEnv === 'production'
      ? winston.format.json()
      : winston.format.printf(({ level, message, timestamp }) => {
          const colors: any = { info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m', debug: '\x1b[90m' };
          const reset = '\x1b[0m';
          const color = colors[level] || '';
          return `${color}[${timestamp}] ${level.toUpperCase()}${reset} ${message}`;
        })
  ),
  transports: [new winston.transports.Console()],
});
