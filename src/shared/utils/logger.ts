import pino, { type LoggerOptions } from 'pino';
import { config } from '@config/app.config.js';

const options: LoggerOptions = {
  level: config.isDevelopment ? 'debug' : 'info',
  redact: ['req.headers.authorization', 'password', 'token'],
};

// Only add pino-pretty transport in development (it's a devDependency)
if (config.isDevelopment) {
  options.transport = { target: 'pino-pretty', options: { colorize: true } };
}

export const logger = pino(options);
