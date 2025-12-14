import type { FastifyInstance } from 'fastify';
import { requireAuth } from '@shared/middleware/auth.middleware.js';
import { AppError } from '@shared/errors/app-error.js';
import { ErrorCodes } from '@shared/errors/error-codes.js';
import {
  createEvent,
  getEventById,
  listEvents,
  updateEvent,
  deleteEvent,
} from './events.service.js';
import {
  CreateEventSchema,
  UpdateEventSchema,
  ListEventsQuerySchema,
  EventIdParamSchema,
} from './events.schema.js';

const UserRole = {
  SUPER_ADMIN: 0,
  CLIENT_ADMIN: 1,
} as const;

export async function eventsRoutes(app: FastifyInstance): Promise<void> {
  // All routes require authentication
  app.addHook('onRequest', requireAuth);

  // POST /api/events - Create event
  app.post('/', async (request, reply) => {
    const input = CreateEventSchema.parse(request.body);

    // Check if user is super_admin or creating event for their own client
    const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
    const isOwnClient = request.user!.clientId === input.clientId;

    if (!isSuperAdmin && !isOwnClient) {
      throw new AppError(
        'Insufficient permissions to create event for this client',
        403,
        true,
        ErrorCodes.FORBIDDEN
      );
    }

    const event = await createEvent(input);
    return reply.status(201).send(event);
  });

  // GET /api/events - List events
  app.get('/', async (request, reply) => {
    const query = ListEventsQuerySchema.parse(request.query);

    // Force clientId filter for client_admin users
    if (request.user!.role === UserRole.CLIENT_ADMIN) {
      if (!request.user!.clientId) {
        throw new AppError(
          'User is not associated with any client',
          400,
          true,
          ErrorCodes.BAD_REQUEST
        );
      }
      query.clientId = request.user!.clientId;
    }

    const result = await listEvents(query);
    return reply.send(result);
  });

  // GET /api/events/:id - Get event
  app.get('/:id', async (request, reply) => {
    const { id } = EventIdParamSchema.parse(request.params);

    const event = await getEventById(id);
    if (!event) {
      throw new AppError('Event not found', 404, true, ErrorCodes.NOT_FOUND);
    }

    // Check if user is super_admin or accessing their own client's event
    const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
    const isOwnClient = request.user!.clientId === event.clientId;

    if (!isSuperAdmin && !isOwnClient) {
      throw new AppError(
        'Insufficient permissions to access this event',
        403,
        true,
        ErrorCodes.FORBIDDEN
      );
    }

    return reply.send(event);
  });

  // PATCH /api/events/:id - Update event
  app.patch('/:id', async (request, reply) => {
    const { id } = EventIdParamSchema.parse(request.params);
    const input = UpdateEventSchema.parse(request.body);

    // Get event to check ownership
    const event = await getEventById(id);
    if (!event) {
      throw new AppError('Event not found', 404, true, ErrorCodes.NOT_FOUND);
    }

    // Check if user is super_admin or updating their own client's event
    const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
    const isOwnClient = request.user!.clientId === event.clientId;

    if (!isSuperAdmin && !isOwnClient) {
      throw new AppError(
        'Insufficient permissions to update this event',
        403,
        true,
        ErrorCodes.FORBIDDEN
      );
    }

    const updatedEvent = await updateEvent(id, input);
    return reply.send(updatedEvent);
  });

  // DELETE /api/events/:id - Delete event
  app.delete('/:id', async (request, reply) => {
    const { id } = EventIdParamSchema.parse(request.params);

    // Get event to check ownership
    const event = await getEventById(id);
    if (!event) {
      throw new AppError('Event not found', 404, true, ErrorCodes.NOT_FOUND);
    }

    // Check if user is super_admin or deleting their own client's event
    const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
    const isOwnClient = request.user!.clientId === event.clientId;

    if (!isSuperAdmin && !isOwnClient) {
      throw new AppError(
        'Insufficient permissions to delete this event',
        403,
        true,
        ErrorCodes.FORBIDDEN
      );
    }

    await deleteEvent(id);
    return reply.status(204).send();
  });
}
