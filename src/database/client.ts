import { PrismaClient } from '@prisma/client';
import { config } from '@config/app.config.js';

function createPrismaClient() {
  return new PrismaClient({
    log: config.isDevelopment ? ['query', 'error', 'warn'] : ['error', 'warn'],
    transactionOptions: {
      isolationLevel: 'Serializable',
      maxWait: 5000,
      timeout: 10000,
    },
  }).$extends({
    query: {
      user: {
        async $allOperations({ args, query }) {
          if ('omit' in args) {
            args.omit = { createdAt: true, updatedAt: true, ...args.omit };
          } else {
            (args as Record<string, unknown>).omit = { createdAt: true, updatedAt: true };
          }
          return query(args);
        },
      },
    },
  });
}

export type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as { prisma: ExtendedPrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (!config.isProduction) globalForPrisma.prisma = prisma;
