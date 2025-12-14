import type { FastifyInstance } from 'fastify';
import { requireAuth, requireSuperAdmin } from '@shared/middleware/auth.middleware.js';
import { AppError } from '@shared/errors/app-error.js';
import { ErrorCodes } from '@shared/errors/error-codes.js';
import {
  createClient,
  getClientById,
  listClients,
  updateClient,
  deleteClient,
} from './clients.service.js';
import {
  CreateClientSchema,
  UpdateClientSchema,
  ListClientsQuerySchema,
  ClientIdParamSchema,
} from './clients.schema.js';

const UserRole = {
  SUPER_ADMIN: 0,
  CLIENT_ADMIN: 1,
} as const;

export async function clientsRoutes(app: FastifyInstance): Promise<void> {
  // All routes require authentication
  app.addHook('onRequest', requireAuth);

  // GET /api/clients/me - Get current user's client (any authenticated user)
  app.get('/me', async (request, reply) => {
    const { clientId } = request.user;

    if (!clientId) {
      throw new AppError(
        'User is not associated with any client',
        404,
        true,
        ErrorCodes.NOT_FOUND
      );
    }

    const client = await getClientById(clientId);
    if (!client) {
      throw new AppError('Client not found', 404, true, ErrorCodes.NOT_FOUND);
    }

    return reply.send(client);
  });

  // POST /api/clients - Create client (super_admin only)
  app.post('/', { preHandler: [requireSuperAdmin] }, async (request, reply) => {
    const input = CreateClientSchema.parse(request.body);
    const client = await createClient(input);
    return reply.status(201).send(client);
  });

  // GET /api/clients - List clients (super_admin only)
  app.get('/', { preHandler: [requireSuperAdmin] }, async (request, reply) => {
    const query = ListClientsQuerySchema.parse(request.query);
    const result = await listClients(query);
    return reply.send(result);
  });

  // GET /api/clients/:id - Get client (super_admin or own client)
  app.get('/:id', async (request, reply) => {
    const { id } = ClientIdParamSchema.parse(request.params);

    // Check if user is super_admin or requesting their own client
    const isSuperAdmin = request.user.role === UserRole.SUPER_ADMIN;
    const isOwnClient = request.user.clientId === id;

    if (!isSuperAdmin && !isOwnClient) {
      throw new AppError(
        'Insufficient permissions to access this client',
        403,
        true,
        ErrorCodes.FORBIDDEN
      );
    }

    const client = await getClientById(id);
    if (!client) {
      throw new AppError('Client not found', 404, true, ErrorCodes.NOT_FOUND);
    }

    return reply.send(client);
  });

  // PATCH /api/clients/:id - Update client (super_admin only)
  app.patch('/:id', { preHandler: [requireSuperAdmin] }, async (request, reply) => {
    const { id } = ClientIdParamSchema.parse(request.params);
    const input = UpdateClientSchema.parse(request.body);
    const client = await updateClient(id, input);
    return reply.send(client);
  });

  // DELETE /api/clients/:id - Delete client (super_admin only)
  app.delete('/:id', { preHandler: [requireSuperAdmin] }, async (request, reply) => {
    const { id } = ClientIdParamSchema.parse(request.params);
    await deleteClient(id);
    return reply.status(204).send();
  });
}
