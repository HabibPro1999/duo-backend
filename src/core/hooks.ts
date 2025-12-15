import { randomUUID } from 'crypto';
import type { AppInstance } from '@shared/types/fastify.js';

export function registerHooks(app: AppInstance) {
  // Add request ID
  app.addHook('onRequest', async (request) => {
    request.id = request.headers['x-request-id'] as string || randomUUID();
  });

  // Add response headers
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });
}
