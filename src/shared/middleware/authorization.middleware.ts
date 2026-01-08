import type { FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '@shared/errors/app-error.js';
import { ErrorCodes } from '@shared/errors/error-codes.js';
import { getEventById } from '@events';
import { getClientById } from '@clients';

const UserRole = {
  SUPER_ADMIN: 0,
  CLIENT_ADMIN: 1,
} as const;

/**
 * Generic resource ownership check middleware factory.
 * Checks if user is super admin OR owns the resource via clientId.
 *
 * @param getResource - Function to fetch resource from request params
 * @param resourceName - Name for error messages
 * @param paramKey - Request param key containing the resource ID
 */
export function requireOwnershipOrSuperAdmin<T extends { clientId: string }>(
  getResource: (id: string) => Promise<T | null>,
  resourceName: string = 'Resource',
  paramKey: string = 'id'
) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      throw new AppError('Authentication required', 401, true, ErrorCodes.UNAUTHORIZED);
    }

    const resourceId = (request.params as Record<string, string>)[paramKey];
    if (!resourceId) {
      throw new AppError(`Missing ${paramKey} parameter`, 400, true, ErrorCodes.BAD_REQUEST);
    }

    const resource = await getResource(resourceId);
    if (!resource) {
      throw new AppError(`${resourceName} not found`, 404, true, ErrorCodes.NOT_FOUND);
    }

    const isSuperAdmin = request.user.role === UserRole.SUPER_ADMIN;
    const isOwner = request.user.clientId === resource.clientId;

    if (!isSuperAdmin && !isOwner) {
      throw new AppError(
        `Insufficient permissions to access this ${resourceName.toLowerCase()}`,
        403,
        true,
        ErrorCodes.FORBIDDEN
      );
    }

    // Attach the fetched resource to request for reuse in handler
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (request as any)[resourceName.toLowerCase()] = resource;
  };
}

/**
 * Middleware to require event ownership or super admin access.
 * Attaches the event to request.event if authorized.
 */
export function requireEventOwnership(paramKey: string = 'eventId') {
  return requireOwnershipOrSuperAdmin(getEventById, 'Event', paramKey);
}

/**
 * Middleware to require that user is super admin OR the client admin for the requested client.
 * For client resources, the client IS the resource (has id, not clientId).
 */
export function requireClientAdminOrSuperAdmin(paramKey: string = 'clientId') {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      throw new AppError('Authentication required', 401, true, ErrorCodes.UNAUTHORIZED);
    }

    const clientId = (request.params as Record<string, string>)[paramKey];
    if (!clientId) {
      throw new AppError(`Missing ${paramKey} parameter`, 400, true, ErrorCodes.BAD_REQUEST);
    }

    const client = await getClientById(clientId);
    if (!client) {
      throw new AppError('Client not found', 404, true, ErrorCodes.NOT_FOUND);
    }

    const isSuperAdmin = request.user.role === UserRole.SUPER_ADMIN;
    const isOwnClient = request.user.clientId === clientId;

    if (!isSuperAdmin && !isOwnClient) {
      throw new AppError(
        'Insufficient permissions to access this client',
        403,
        true,
        ErrorCodes.FORBIDDEN
      );
    }

    // Attach client to request
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (request as any).client = client;
  };
}

/**
 * Check if user has access to a specific client's resources.
 * Use this when you already have the clientId but not the full resource.
 */
export async function requireClientAccess(
  request: FastifyRequest,
  clientId: string | null
): Promise<void> {
  if (!request.user) {
    throw new AppError('Authentication required', 401, true, ErrorCodes.UNAUTHORIZED);
  }

  // Super admin can access all clients
  if (request.user.role === UserRole.SUPER_ADMIN) {
    return;
  }

  // Client admin can only access their own client
  if (request.user.clientId !== clientId) {
    throw new AppError(
      'Insufficient permissions to access this resource',
      403,
      true,
      ErrorCodes.FORBIDDEN
    );
  }
}
