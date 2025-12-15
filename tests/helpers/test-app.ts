import { buildServer } from '../../src/core/server.js';
import { prisma } from '../../src/database/client.js';
import type { AppInstance } from '../../src/shared/types/fastify.js';

/**
 * Create a test Fastify instance.
 */
export async function createTestApp(): Promise<AppInstance> {
  const app = await buildServer();
  await app.ready();
  return app;
}

/**
 * Clean up database for testing.
 * Deletes all records in order respecting FK constraints.
 */
export async function cleanupDatabase(): Promise<void> {
  // Delete in correct order to respect FK constraints
  await prisma.form.deleteMany();
  await prisma.pricingRule.deleteMany();
  await prisma.eventExtra.deleteMany();
  await prisma.event.deleteMany();
  await prisma.user.deleteMany();
  await prisma.client.deleteMany();
}
