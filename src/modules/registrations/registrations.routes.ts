import { requireAuth } from '@shared/middleware/auth.middleware.js';
import { getEventById } from '@events';
import {
  getRegistrationById,
  updateRegistration,
  confirmPayment,
  cancelRegistration,
  listRegistrations,
  addRegistrationNote,
  listRegistrationNotes,
  getRegistrationClientId,
} from './registrations.service.js';
import {
  RegistrationIdParamSchema,
  EventIdParamSchema,
  UpdateRegistrationSchema,
  UpdatePaymentSchema,
  CreateRegistrationNoteSchema,
  ListRegistrationsQuerySchema,
  type UpdateRegistrationInput,
  type UpdatePaymentInput,
  type CreateRegistrationNoteInput,
  type ListRegistrationsQuery,
} from './registrations.schema.js';
import type { AppInstance } from '@shared/types/fastify.js';

const UserRole = {
  SUPER_ADMIN: 0,
  CLIENT_ADMIN: 1,
} as const;

// ============================================================================
// Protected Routes (Admin)
// ============================================================================

export async function registrationsRoutes(app: AppInstance): Promise<void> {
  app.addHook('onRequest', requireAuth);

  // GET /api/events/:eventId/registrations - List registrations for an event
  app.get<{
    Params: { eventId: string };
    Querystring: ListRegistrationsQuery;
  }>(
    '/:eventId/registrations',
    {
      schema: {
        params: EventIdParamSchema,
        querystring: ListRegistrationsQuerySchema,
      },
    },
    async (request, reply) => {
      const { eventId } = request.params;
      const query = request.query;

      const event = await getEventById(eventId);
      if (!event) {
        throw app.httpErrors.notFound('Event not found');
      }

      const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
      const isOwnClient = request.user!.clientId === event.clientId;

      if (!isSuperAdmin && !isOwnClient) {
        throw app.httpErrors.forbidden('Insufficient permissions');
      }

      const registrations = await listRegistrations(eventId, query);
      return reply.send(registrations);
    }
  );

  // GET /api/registrations/:id - Get single registration
  app.get<{ Params: { id: string } }>(
    '/registrations/:id',
    {
      schema: { params: RegistrationIdParamSchema },
    },
    async (request, reply) => {
      const { id } = request.params;

      const registration = await getRegistrationById(id, true);
      if (!registration) {
        throw app.httpErrors.notFound('Registration not found');
      }

      const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
      const isOwnClient = request.user!.clientId === registration.event.clientId;

      if (!isSuperAdmin && !isOwnClient) {
        throw app.httpErrors.forbidden('Insufficient permissions');
      }

      return reply.send(registration);
    }
  );

  // PATCH /api/registrations/:id - Update registration
  app.patch<{ Params: { id: string }; Body: UpdateRegistrationInput }>(
    '/registrations/:id',
    {
      schema: {
        params: RegistrationIdParamSchema,
        body: UpdateRegistrationSchema,
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const input = request.body;

      const clientId = await getRegistrationClientId(id);
      if (!clientId) {
        throw app.httpErrors.notFound('Registration not found');
      }

      const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
      const isOwnClient = request.user!.clientId === clientId;

      if (!isSuperAdmin && !isOwnClient) {
        throw app.httpErrors.forbidden('Insufficient permissions');
      }

      const registration = await updateRegistration(id, input);
      return reply.send(registration);
    }
  );

  // POST /api/registrations/:id/confirm - Confirm payment
  app.post<{ Params: { id: string }; Body: UpdatePaymentInput }>(
    '/registrations/:id/confirm',
    {
      schema: {
        params: RegistrationIdParamSchema,
        body: UpdatePaymentSchema,
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const input = request.body;

      const clientId = await getRegistrationClientId(id);
      if (!clientId) {
        throw app.httpErrors.notFound('Registration not found');
      }

      const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
      const isOwnClient = request.user!.clientId === clientId;

      if (!isSuperAdmin && !isOwnClient) {
        throw app.httpErrors.forbidden('Insufficient permissions');
      }

      const registration = await confirmPayment(id, input);
      return reply.send(registration);
    }
  );

  // POST /api/registrations/:id/cancel - Cancel registration
  app.post<{ Params: { id: string } }>(
    '/registrations/:id/cancel',
    {
      schema: { params: RegistrationIdParamSchema },
    },
    async (request, reply) => {
      const { id } = request.params;

      const clientId = await getRegistrationClientId(id);
      if (!clientId) {
        throw app.httpErrors.notFound('Registration not found');
      }

      const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
      const isOwnClient = request.user!.clientId === clientId;

      if (!isSuperAdmin && !isOwnClient) {
        throw app.httpErrors.forbidden('Insufficient permissions');
      }

      const registration = await cancelRegistration(id);
      return reply.send(registration);
    }
  );

  // POST /api/registrations/:id/notes - Add note to registration
  app.post<{ Params: { id: string }; Body: CreateRegistrationNoteInput }>(
    '/registrations/:id/notes',
    {
      schema: {
        params: RegistrationIdParamSchema,
        body: CreateRegistrationNoteSchema,
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const input = request.body;

      const clientId = await getRegistrationClientId(id);
      if (!clientId) {
        throw app.httpErrors.notFound('Registration not found');
      }

      const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
      const isOwnClient = request.user!.clientId === clientId;

      if (!isSuperAdmin && !isOwnClient) {
        throw app.httpErrors.forbidden('Insufficient permissions');
      }

      const note = await addRegistrationNote(id, request.user!.id, input);
      return reply.status(201).send(note);
    }
  );

  // GET /api/registrations/:id/notes - List notes for registration
  app.get<{ Params: { id: string } }>(
    '/registrations/:id/notes',
    {
      schema: { params: RegistrationIdParamSchema },
    },
    async (request, reply) => {
      const { id } = request.params;

      const clientId = await getRegistrationClientId(id);
      if (!clientId) {
        throw app.httpErrors.notFound('Registration not found');
      }

      const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
      const isOwnClient = request.user!.clientId === clientId;

      if (!isSuperAdmin && !isOwnClient) {
        throw app.httpErrors.forbidden('Insufficient permissions');
      }

      const notes = await listRegistrationNotes(id);
      return reply.send(notes);
    }
  );
}
