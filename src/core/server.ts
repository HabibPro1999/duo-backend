import Fastify from 'fastify';
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
import { eventsRoutes } from '@events';
import { formsRoutes, formsPublicRoutes } from '@forms';
import { pricingRulesRoutes, eventExtrasRoutes, pricingPublicRoutes } from '@pricing';
import type { AppInstance } from '@shared/types/fastify.js';

export async function buildServer(): Promise<AppInstance> {
  const app = Fastify({
    loggerInstance: logger,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Decorate with prisma
  app.decorate('prisma', prisma);

  // Register plugins (CORS, Helmet, Rate Limit)
  await registerPlugins(app);

  // Register lifecycle hooks
  registerHooks(app);

  // Health check with database connectivity
  app.get('/health', async (_request, reply) => {
    const checks: Record<string, 'connected' | 'disconnected'> = {
      database: 'disconnected',
    };

    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = 'connected';
    } catch {
      // Database check failed
    }

    const allHealthy = Object.values(checks).every((v) => v === 'connected');
    const status = allHealthy ? 'ok' : 'degraded';
    const statusCode = allHealthy ? 200 : 503;

    return reply.status(statusCode).send({
      status,
      timestamp: new Date().toISOString(),
      checks,
    });
  });

  // Register module routes
  await app.register(usersRoutes, { prefix: '/api/users' });
  await app.register(clientsRoutes, { prefix: '/api/clients' });
  await app.register(eventsRoutes, { prefix: '/api/events' });
  await app.register(formsRoutes, { prefix: '/api/forms' });
  await app.register(formsPublicRoutes, { prefix: '/api/forms/public' });

  // Pricing routes
  await app.register(pricingRulesRoutes, { prefix: '/api/events' });
  await app.register(eventExtrasRoutes, { prefix: '/api/events' });
  await app.register(pricingPublicRoutes, { prefix: '/api' });

  // Global error handler
  app.setErrorHandler(errorHandler);

  return app;
}
