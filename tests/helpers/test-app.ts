import { buildServer } from '../../src/core/server.js';
import { prisma } from '../../src/database/client.js';
import type { AppInstance } from '../../src/shared/types/fastify.js';
import type { User, Client } from '../../src/generated/prisma/client.js';
import {
  createMockClient,
  createMockUser,
  createMockSuperAdmin,
  createMockClientAdmin,
} from './factories.js';

// ============================================================================
// Test App Creation
// ============================================================================

/**
 * Create a test Fastify instance.
 */
export async function createTestApp(): Promise<AppInstance> {
  const app = await buildServer();
  await app.ready();
  return app;
}

// ============================================================================
// Database Cleanup
// ============================================================================

/**
 * Clean up database for testing.
 * Deletes all records in order respecting FK constraints.
 */
export async function cleanupDatabase(): Promise<void> {
  // Delete in correct order to respect FK constraints
  await prisma.emailLog.deleteMany();
  await prisma.emailTemplate.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.sponsorshipUsage.deleteMany();
  await prisma.sponsorship.deleteMany();
  await prisma.sponsorshipBatch.deleteMany();
  await prisma.registration.deleteMany();
  await prisma.form.deleteMany();
  await prisma.eventAccess.deleteMany();
  await prisma.eventPricing.deleteMany();
  await prisma.event.deleteMany();
  await prisma.user.deleteMany();
  await prisma.client.deleteMany();
}

// ============================================================================
// Test Data Seeding
// ============================================================================

export interface SeedResult {
  client: Client;
  superAdmin: User;
  clientAdmin: User;
}

/**
 * Seed minimal test data: client, super admin, and client admin.
 */
export async function seedTestData(): Promise<SeedResult> {
  // Create client
  const clientData = createMockClient();
  const client = await prisma.client.create({
    data: {
      id: clientData.id,
      name: clientData.name,
      email: clientData.email,
      phone: clientData.phone,
      active: true,
      enabledModules: clientData.enabledModules,
    },
  });

  // Create super admin (no clientId)
  const superAdminData = createMockSuperAdmin();
  const superAdmin = await prisma.user.create({
    data: {
      id: superAdminData.id,
      email: superAdminData.email,
      name: superAdminData.name,
      role: 0,
      active: true,
    },
  });

  // Create client admin
  const clientAdminData = createMockClientAdmin(client.id);
  const clientAdmin = await prisma.user.create({
    data: {
      id: clientAdminData.id,
      email: clientAdminData.email,
      name: clientAdminData.name,
      role: 1,
      clientId: client.id,
      active: true,
    },
  });

  return { client, superAdmin, clientAdmin };
}

// ============================================================================
// Auth Helpers for Integration Tests
// ============================================================================

/**
 * Create authorization headers for a user.
 * Note: For integration tests, you need to mock Firebase token verification.
 */
export function createAuthHeaders(user: User): Record<string, string> {
  return {
    authorization: `Bearer mock-token-${user.id}`,
  };
}
