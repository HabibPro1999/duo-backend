import type { User } from '@prisma/client';
import type { ExtendedPrismaClient } from '@/database/client.js';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: ExtendedPrismaClient;
  }

  interface FastifyRequest {
    user?: User;
  }
}
