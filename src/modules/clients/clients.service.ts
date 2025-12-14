import { prisma } from '@/database/client.js';
import { AppError } from '@shared/errors/app-error.js';
import { ErrorCodes } from '@shared/errors/error-codes.js';
import type { CreateClientInput, UpdateClientInput, ListClientsQuery } from './clients.schema.js';
import type { Client, Prisma } from '@prisma/client';

/**
 * Create a new client.
 */
export async function createClient(input: CreateClientInput): Promise<Client> {
  const { name, logo, primaryColor, email, phone } = input;

  return prisma.client.create({
    data: {
      name,
      logo: logo ?? null,
      primaryColor: primaryColor ?? null,
      email: email ?? null,
      phone: phone ?? null,
    },
  });
}

/**
 * Get client by ID.
 */
export async function getClientById(id: string): Promise<Client | null> {
  return prisma.client.findUnique({ where: { id } });
}

/**
 * Update client.
 */
export async function updateClient(
  id: string,
  input: UpdateClientInput
): Promise<Client> {
  // Check if client exists
  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) {
    throw new AppError('Client not found', 404, true, ErrorCodes.NOT_FOUND);
  }

  return prisma.client.update({
    where: { id },
    data: input,
  });
}

/**
 * List clients with pagination and filters.
 */
export async function listClients(query: ListClientsQuery): Promise<{
  data: Client[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}> {
  const { page, limit, active, search } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.ClientWhereInput = {};

  if (active !== undefined) where.active = active;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.client.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.client.count({ where }),
  ]);

  return {
    data,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

/**
 * Delete client.
 */
export async function deleteClient(id: string): Promise<void> {
  // Check if client exists
  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) {
    throw new AppError('Client not found', 404, true, ErrorCodes.NOT_FOUND);
  }

  // Check if any users are associated with this client
  const usersCount = await prisma.user.count({ where: { clientId: id } });
  if (usersCount > 0) {
    throw new AppError(
      'Cannot delete client with associated users',
      400,
      true,
      ErrorCodes.BAD_REQUEST
    );
  }

  await prisma.client.delete({ where: { id } });
}

/**
 * Helper function to check if client exists (for validation in other modules).
 */
export async function clientExists(id: string): Promise<boolean> {
  const count = await prisma.client.count({ where: { id } });
  return count > 0;
}
