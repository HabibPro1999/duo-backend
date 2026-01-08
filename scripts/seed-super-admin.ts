/// <reference types="node" />
/**
 * Seed script to create the initial super admin use
 * Run with: npx tsx scripts/seed-super-admin.ts
 */
import 'dotenv/config';
import { createUser } from '../src/modules/identity/users.service.js';
import { UserRole } from '../src/modules/identity/permissions.js';
import { prisma } from '../src/database/client.js';

const { SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD, SUPER_ADMIN_NAME } = process.env;

if (!SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD) {
  console.error('Error: Missing SUPER_ADMIN_EMAIL or SUPER_ADMIN_PASSWORD in .env');
  console.error('Please add the following to your .env file:');
  console.error('  SUPER_ADMIN_EMAIL=your-email@example.com');
  console.error('  SUPER_ADMIN_PASSWORD=YourSecurePassword123!');
  console.error('  SUPER_ADMIN_NAME=Super Admin (optional)');
  process.exit(1);
}

async function main() {
  console.log('Creating super admin user...');

  // Check if super admin already exists
  const existing = await prisma.user.findFirst({
    where: { role: UserRole.SUPER_ADMIN },
  });

  if (existing) {
    console.log('Super admin already exists:', existing.email);
    process.exit(0);
  }

  const user = await createUser({
    email: SUPER_ADMIN_EMAIL!,
    password: SUPER_ADMIN_PASSWORD!,
    name: SUPER_ADMIN_NAME || 'Super Admin',
    role: UserRole.SUPER_ADMIN,
  });

  console.log('Super admin created successfully!');
  console.log('  ID:', user.id);
  console.log('  Email:', user.email);
  console.log('  Name:', user.name);

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('Failed to create super admin:', error.message);
  await prisma.$disconnect();
  process.exit(1);
});
