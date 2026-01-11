import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken } from '@shared/services/firebase.service.js';
import { prisma } from '@/database/client.js';
import { AppError } from '@shared/errors/app-error.js';
import { ErrorCodes } from '@shared/errors/error-codes.js';
import { UserRole } from '@modules/identity/permissions.js';

/**
 * Middleware to require authentication.
 * Verifies Firebase ID token and attaches user to request.
 */
export async function requireAuth(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError(
      'Missing or invalid authorization header',
      401,
      true,
      ErrorCodes.UNAUTHORIZED
    );
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const decoded = await verifyToken(token);

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.uid },
    });

    if (!user) {
      throw new AppError(
        'User not found in database',
        401,
        true,
        ErrorCodes.UNAUTHORIZED
      );
    }

    if (!user.active) {
      throw new AppError(
        'User account is disabled',
        401,
        true,
        ErrorCodes.UNAUTHORIZED
      );
    }

    // Attach user to request
    request.user = user;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      'Invalid or expired token',
      401,
      true,
      ErrorCodes.INVALID_TOKEN
    );
  }
}

/**
 * Factory function to create a middleware that checks for specific roles.
 * @param roles - Array of allowed role numbers (0 = super_admin, 1 = client_admin)
 */
export function requireRole(...roles: number[]) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      throw new AppError(
        'Authentication required',
        401,
        true,
        ErrorCodes.UNAUTHORIZED
      );
    }

    if (!roles.includes(request.user.role)) {
      throw new AppError(
        'Insufficient permissions',
        403,
        true,
        ErrorCodes.FORBIDDEN
      );
    }
  };
}

/**
 * Middleware that requires super admin role (role = 0).
 */
export const requireSuperAdmin = requireRole(UserRole.SUPER_ADMIN);

/**
 * Middleware that allows both super admin and client admin.
 */
export const requireAdmin = requireRole(UserRole.SUPER_ADMIN, UserRole.CLIENT_ADMIN);
