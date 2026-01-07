import { requireAuth } from '@shared/middleware/auth.middleware.js';
import { getEventById } from '@events';
import {
  listSponsorships,
  getSponsorshipById,
  updateSponsorship,
  deleteSponsorship,
  linkSponsorshipToRegistration,
  linkSponsorshipByCode,
  unlinkSponsorshipFromRegistration,
  getAvailableSponsorships,
  getSponsorshipClientId,
} from './sponsorships.service.js';
import { getRegistrationById } from '@registrations';
import {
  EventIdParamSchema,
  SponsorshipIdParamSchema,
  RegistrationIdParamSchema,
  RegistrationSponsorshipParamSchema,
  ListSponsorshipsQuerySchema,
  UpdateSponsorshipSchema,
  LinkSponsorshipSchema,
  LinkSponsorshipByCodeSchema,
  type ListSponsorshipsQuery,
  type UpdateSponsorshipInput,
  type LinkSponsorshipInput,
  type LinkSponsorshipByCodeInput,
} from './sponsorships.schema.js';
import type { AppInstance } from '@shared/types/fastify.js';

const UserRole = {
  SUPER_ADMIN: 0,
  CLIENT_ADMIN: 1,
} as const;

// ============================================================================
// Event-scoped Sponsorship Routes (mounted at /api/events)
// ============================================================================

export async function sponsorshipsRoutes(app: AppInstance): Promise<void> {
  app.addHook('onRequest', requireAuth);

  // GET /api/events/:eventId/sponsorships - List sponsorships for an event
  app.get<{
    Params: { eventId: string };
    Querystring: ListSponsorshipsQuery;
  }>(
    '/:eventId/sponsorships',
    {
      schema: {
        params: EventIdParamSchema,
        querystring: ListSponsorshipsQuerySchema,
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

      const sponsorships = await listSponsorships(eventId, query);
      return reply.send(sponsorships);
    }
  );
}

// ============================================================================
// Sponsorship Detail Routes (mounted at /api/sponsorships)
// ============================================================================

export async function sponsorshipDetailRoutes(app: AppInstance): Promise<void> {
  app.addHook('onRequest', requireAuth);

  // GET /api/sponsorships/:id - Get sponsorship detail
  app.get<{ Params: { id: string } }>(
    '/:id',
    {
      schema: { params: SponsorshipIdParamSchema },
    },
    async (request, reply) => {
      const { id } = request.params;

      const sponsorship = await getSponsorshipById(id);
      if (!sponsorship) {
        throw app.httpErrors.notFound('Sponsorship not found');
      }

      const clientId = await getSponsorshipClientId(id);
      const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
      const isOwnClient = request.user!.clientId === clientId;

      if (!isSuperAdmin && !isOwnClient) {
        throw app.httpErrors.forbidden('Insufficient permissions');
      }

      return reply.send(sponsorship);
    }
  );

  // PATCH /api/sponsorships/:id - Update sponsorship
  app.patch<{ Params: { id: string }; Body: UpdateSponsorshipInput }>(
    '/:id',
    {
      schema: {
        params: SponsorshipIdParamSchema,
        body: UpdateSponsorshipSchema,
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const input = request.body;

      const clientId = await getSponsorshipClientId(id);
      if (!clientId) {
        throw app.httpErrors.notFound('Sponsorship not found');
      }

      const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
      const isOwnClient = request.user!.clientId === clientId;

      if (!isSuperAdmin && !isOwnClient) {
        throw app.httpErrors.forbidden('Insufficient permissions');
      }

      const sponsorship = await updateSponsorship(id, input);
      return reply.send(sponsorship);
    }
  );

  // DELETE /api/sponsorships/:id - Delete sponsorship
  app.delete<{ Params: { id: string } }>(
    '/:id',
    {
      schema: { params: SponsorshipIdParamSchema },
    },
    async (request, reply) => {
      const { id } = request.params;

      const clientId = await getSponsorshipClientId(id);
      if (!clientId) {
        throw app.httpErrors.notFound('Sponsorship not found');
      }

      const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
      const isOwnClient = request.user!.clientId === clientId;

      if (!isSuperAdmin && !isOwnClient) {
        throw app.httpErrors.forbidden('Insufficient permissions');
      }

      await deleteSponsorship(id);
      return reply.send({ success: true });
    }
  );
}

// ============================================================================
// Registration-Sponsorship Routes (Authenticated)
// ============================================================================

export async function registrationSponsorshipsRoutes(app: AppInstance): Promise<void> {
  app.addHook('onRequest', requireAuth);

  // GET /api/registrations/:registrationId/available-sponsorships
  app.get<{ Params: { registrationId: string } }>(
    '/:registrationId/available-sponsorships',
    {
      schema: { params: RegistrationIdParamSchema },
    },
    async (request, reply) => {
      const { registrationId } = request.params;

      const registration = await getRegistrationById(registrationId);
      if (!registration) {
        throw app.httpErrors.notFound('Registration not found');
      }

      const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
      const isOwnClient = request.user!.clientId === registration.event.clientId;

      if (!isSuperAdmin && !isOwnClient) {
        throw app.httpErrors.forbidden('Insufficient permissions');
      }

      const sponsorships = await getAvailableSponsorships(
        registration.event.id,
        registrationId
      );
      return reply.send({ sponsorships });
    }
  );

  // POST /api/registrations/:registrationId/sponsorships - Link by ID
  app.post<{ Params: { registrationId: string }; Body: LinkSponsorshipInput }>(
    '/:registrationId/sponsorships',
    {
      schema: {
        params: RegistrationIdParamSchema,
        body: LinkSponsorshipSchema,
      },
    },
    async (request, reply) => {
      const { registrationId } = request.params;
      const { sponsorshipId } = request.body;

      const registration = await getRegistrationById(registrationId);
      if (!registration) {
        throw app.httpErrors.notFound('Registration not found');
      }

      const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
      const isOwnClient = request.user!.clientId === registration.event.clientId;

      if (!isSuperAdmin && !isOwnClient) {
        throw app.httpErrors.forbidden('Insufficient permissions');
      }

      const result = await linkSponsorshipToRegistration(
        sponsorshipId,
        registrationId,
        request.user!.id
      );

      return reply.status(201).send({ success: true, ...result });
    }
  );

  // POST /api/registrations/:registrationId/sponsorships/by-code - Link by code
  app.post<{ Params: { registrationId: string }; Body: LinkSponsorshipByCodeInput }>(
    '/:registrationId/sponsorships/by-code',
    {
      schema: {
        params: RegistrationIdParamSchema,
        body: LinkSponsorshipByCodeSchema,
      },
    },
    async (request, reply) => {
      const { registrationId } = request.params;
      const { code } = request.body;

      const registration = await getRegistrationById(registrationId);
      if (!registration) {
        throw app.httpErrors.notFound('Registration not found');
      }

      const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
      const isOwnClient = request.user!.clientId === registration.event.clientId;

      if (!isSuperAdmin && !isOwnClient) {
        throw app.httpErrors.forbidden('Insufficient permissions');
      }

      const result = await linkSponsorshipByCode(registrationId, code, request.user!.id);

      return reply.status(201).send({ success: true, ...result });
    }
  );

  // DELETE /api/registrations/:registrationId/sponsorships/:sponsorshipId - Unlink
  app.delete<{ Params: { registrationId: string; sponsorshipId: string } }>(
    '/:registrationId/sponsorships/:sponsorshipId',
    {
      schema: { params: RegistrationSponsorshipParamSchema },
    },
    async (request, reply) => {
      const { registrationId, sponsorshipId } = request.params;

      const registration = await getRegistrationById(registrationId);
      if (!registration) {
        throw app.httpErrors.notFound('Registration not found');
      }

      const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
      const isOwnClient = request.user!.clientId === registration.event.clientId;

      if (!isSuperAdmin && !isOwnClient) {
        throw app.httpErrors.forbidden('Insufficient permissions');
      }

      await unlinkSponsorshipFromRegistration(sponsorshipId, registrationId);
      return reply.send({ success: true });
    }
  );
}
