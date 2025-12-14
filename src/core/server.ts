import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { registerPlugins } from './plugins.js';
import { registerHooks } from './hooks.js';
import { errorHandler } from '@shared/middleware/error.middleware.js';
import { prisma } from '@/database/client.js';
import { logger } from '@shared/utils/logger.js';
import { usersRoutes } from '@identity';
import { clientsRoutes } from '@clients';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Decorate with prisma
  app.decorate('prisma', prisma);

  // Register plugins (CORS, Helmet, Rate Limit)
  await registerPlugins(app);

  // Register lifecycle hooks
  registerHooks(app);

  // Health check
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // Register module routes
  await app.register(usersRoutes, { prefix: '/api/users' });
  await app.register(clientsRoutes, { prefix: '/api/clients' });

  // Global error handler
  app.setErrorHandler(errorHandler);

  return app;
}
