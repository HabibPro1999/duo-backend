import { prisma } from '@/database/client.js';
import { AppError } from '@shared/errors/app-error.js';
import { ErrorCodes } from '@shared/errors/error-codes.js';
import {
  createFirebaseUser,
  setCustomClaims,
  deleteFirebaseUser,
} from '@shared/services/firebase.service.js';
import { clientExists } from '@clients';
import { paginate, getSkip, type PaginatedResult } from '@shared/utils/pagination.js';
import type { CreateUserInput, UpdateUserInput, ListUsersQuery } from './users.schema.js';
import type { User, Prisma } from '@prisma/client';

// Define type for user queries with include
type UserWithClient = Prisma.UserGetPayload<{ include: { client: true } }>;

/**
 * Create a new user in Firebase Auth + set custom claims + create in DB.
 */
export async function createUser(
  input: CreateUserInput & { password: string }
): Promise<User> {
  const { email, password, name, role, clientId } = input;

  // Check if user already exists in DB
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError(
      'User with this email already exists',
      409,
      true,
      ErrorCodes.CONFLICT
    );
  }

  // Validate clientId if provided
  if (clientId) {
    const isValidClient = await clientExists(clientId);
    if (!isValidClient) {
      throw new AppError('Invalid client ID', 400, true, ErrorCodes.BAD_REQUEST);
    }
  }

  // Create in Firebase Auth
  const firebaseUser = await createFirebaseUser(email, password);

  try {
    // Set custom claims in Firebase
    await setCustomClaims(firebaseUser.uid, {
      role,
      clientId: clientId ?? null,
    });

    // Create in database
    return prisma.user.create({
      data: {
        id: firebaseUser.uid,
        email,
        name,
        role,
        clientId: clientId ?? null,
      },
    });
  } catch (error) {
    // Rollback: delete from Firebase if DB insert fails
    await deleteFirebaseUser(firebaseUser.uid).catch(() => {
      // Ignore cleanup errors
    });
    throw error;
  }
}

/**
 * Get user by ID from database.
 */
export async function getUserById(id: string): Promise<UserWithClient | null> {
  return prisma.user.findUnique({
    where: { id },
    include: { client: true },
  });
}

/**
 * Update user in database only.
 */
export async function updateUser(
  id: string,
  input: UpdateUserInput
): Promise<UserWithClient> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new AppError('User not found', 404, true, ErrorCodes.NOT_FOUND);
  }

  // Validate clientId if being changed
  if (input.clientId !== undefined && input.clientId !== null) {
    const isValidClient = await clientExists(input.clientId);
    if (!isValidClient) {
      throw new AppError('Invalid client ID', 400, true, ErrorCodes.BAD_REQUEST);
    }
  }

  return prisma.user.update({
    where: { id },
    data: input,
    include: { client: true },
  });
}

/**
 * List users with pagination and filters (DB only).
 */
export async function listUsers(query: ListUsersQuery): Promise<PaginatedResult<UserWithClient>> {
  const { page, limit, role, clientId, active, search } = query;
  const skip = getSkip({ page, limit });

  const where: Prisma.UserWhereInput = {};

  if (role !== undefined) where.role = role;
  if (clientId !== undefined) where.clientId = clientId;
  if (active !== undefined) where.active = active;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { client: true },
    }),
    prisma.user.count({ where }),
  ]);

  return paginate(data, total, { page, limit });
}

/**
 * Delete user from Firebase Auth + database.
 */
export async function deleteUser(id: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new AppError('User not found', 404, true, ErrorCodes.NOT_FOUND);
  }

  await deleteFirebaseUser(id);
  await prisma.user.delete({ where: { id } });
}
