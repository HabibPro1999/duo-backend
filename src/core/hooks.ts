import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';

export function registerHooks(app: FastifyInstance) {
  // Add request ID
  app.addHook('onRequest', async (request) => {
    request.id = request.headers['x-request-id'] as string || randomUUID();
  });

  // Add response headers
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });
}
