import type { FastifyInstance } from 'fastify';
import { prisma } from '@/database/client.js';
import { logger } from '@shared/utils/logger.js';

export function gracefulShutdown(server: FastifyInstance) {
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

  signals.forEach((signal) => {
    process.on(signal, () => {
      logger.info(`Received ${signal}, shutting down gracefully...`);

      void (async () => {
        await server.close();
        await prisma.$disconnect();

        logger.info('Server closed');
        process.exit(0);
      })();
    });
  });
}
