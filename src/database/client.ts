import { PrismaClient } from '@/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from '@config/app.config.js';

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

  return new PrismaClient({
    adapter,
    log: config.isDevelopment ? ['query', 'error', 'warn'] : ['error', 'warn'],
    transactionOptions: {
      isolationLevel: 'Serializable',
      maxWait: 5000,
      timeout: 10000,
    },
  }).$extends({
    query: {
      user: {
        async $allOperations({ operation, args, query }) {
          // Skip omit for aggregate operations (they don't support it)
          const aggregateOps = ['count', 'aggregate', 'groupBy'];
          if (aggregateOps.includes(operation)) {
            return query(args);
          }

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
