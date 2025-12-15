import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { config } from '@config/app.config.js';
import type { AppInstance } from '@shared/types/fastify.js';

export async function registerPlugins(app: AppInstance) {
  // Sensible defaults and HTTP error utilities
  await app.register(sensible, {
    sharedSchemaId: 'HttpError',
  });

  await app.register(cors, {
    origin: config.CORS_ORIGIN,
    credentials: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: config.isProduction,
  });

  await app.register(rateLimit, {
    max: config.security.rateLimit.max,
    timeWindow: config.security.rateLimit.timeWindow,
  });
}
