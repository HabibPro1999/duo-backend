import type { FastifyInstance } from 'fastify';
import { requireAuth, requireSuperAdmin } from '@shared/middleware/auth.middleware.js';
import {
  createUser,
  getUserById,
  listUsers,
  updateUser,
  deleteUser,
} from './users.service.js';
import {
  CreateUserSchema,
  UpdateUserSchema,
  ListUsersQuerySchema,
  UserIdParamSchema,
} from './users.schema.js';

export async function usersRoutes(app: FastifyInstance): Promise<void> {
  // All routes require authentication
  app.addHook('onRequest', requireAuth);

  // GET /api/users/me - Get current user (any authenticated user)
  app.get('/me', async (request, reply) => {
    return reply.send(request.user);
  });

  // POST /api/users - Create user (super_admin only)
  app.post('/', { preHandler: [requireSuperAdmin] }, async (request, reply) => {
    const input = CreateUserSchema.parse(request.body);
    const user = await createUser(input);
    return reply.status(201).send(user);
  });

  // GET /api/users - List users (super_admin only)
  app.get('/', { preHandler: [requireSuperAdmin] }, async (request, reply) => {
    const query = ListUsersQuerySchema.parse(request.query);
    const result = await listUsers(query);
    return reply.send(result);
  });

  // GET /api/users/:id - Get single user (super_admin only)
  app.get('/:id', { preHandler: [requireSuperAdmin] }, async (request, reply) => {
    const { id } = UserIdParamSchema.parse(request.params);
    const user = await getUserById(id);
    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }
    return reply.send(user);
  });

  // PATCH /api/users/:id - Update user (super_admin only)
  app.patch('/:id', { preHandler: [requireSuperAdmin] }, async (request, reply) => {
    const { id } = UserIdParamSchema.parse(request.params);
    const input = UpdateUserSchema.parse(request.body);
    const user = await updateUser(id, input);
    return reply.send(user);
  });

  // DELETE /api/users/:id - Delete user (super_admin only)
  app.delete('/:id', { preHandler: [requireSuperAdmin] }, async (request, reply) => {
    const { id } = UserIdParamSchema.parse(request.params);
    await deleteUser(id);
    return reply.status(204).send();
  });
}
