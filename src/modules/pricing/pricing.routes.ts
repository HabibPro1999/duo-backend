import { requireAuth } from '@shared/middleware/auth.middleware.js';
import { getEventById } from '@events';
import {
  createPricingRule,
  updatePricingRule,
  deletePricingRule,
  listPricingRules,
  getPricingRuleById,
  createEventExtra,
  updateEventExtra,
  deleteEventExtra,
  listEventExtras,
  getEventExtraById,
  getAvailableExtras,
  calculatePrice,
} from './pricing.service.js';
import {
  CreatePricingRuleSchema,
  UpdatePricingRuleSchema,
  ListPricingRulesQuerySchema,
  PricingRuleIdParamSchema,
  CreateEventExtraSchema,
  UpdateEventExtraSchema,
  ListEventExtrasQuerySchema,
  EventExtraIdParamSchema,
  CalculatePriceRequestSchema,
  type CreatePricingRuleInput,
  type UpdatePricingRuleInput,
  type CreateEventExtraInput,
  type UpdateEventExtraInput,
  type CalculatePriceRequest,
} from './pricing.schema.js';
import { z } from 'zod';
import type { AppInstance } from '@shared/types/fastify.js';

const UserRole = {
  SUPER_ADMIN: 0,
  CLIENT_ADMIN: 1,
} as const;

const EventIdParamSchema = z.object({
  eventId: z.string().uuid(),
}).strict();

const FormIdParamSchema = z.object({
  formId: z.string().uuid(),
}).strict();

// ============================================================================
// Pricing Rules Routes (Protected)
// ============================================================================

export async function pricingRulesRoutes(app: AppInstance): Promise<void> {
  // All routes require authentication
  app.addHook('onRequest', requireAuth);

  // POST /api/events/:eventId/pricing-rules - Create pricing rule
  app.post<{ Params: { eventId: string }; Body: Omit<CreatePricingRuleInput, 'eventId'> }>(
    '/:eventId/pricing-rules',
    {
      schema: { params: EventIdParamSchema, body: CreatePricingRuleSchema.omit({ eventId: true }) },
    },
    async (request, reply) => {
      const { eventId } = request.params;
      const input: CreatePricingRuleInput = { ...request.body, eventId };

      // Get event to check ownership
      const event = await getEventById(eventId);
      if (!event) {
        throw app.httpErrors.notFound('Event not found');
      }

      // Check if user is super_admin or creating for their own client
      const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
      const isOwnClient = request.user!.clientId === event.clientId;

      if (!isSuperAdmin && !isOwnClient) {
        throw app.httpErrors.forbidden('Insufficient permissions to create pricing rules for this event');
      }

      const rule = await createPricingRule(input);
      return reply.status(201).send(rule);
    }
  );

  // GET /api/events/:eventId/pricing-rules - List pricing rules
  app.get<{ Params: { eventId: string }; Querystring: z.infer<typeof ListPricingRulesQuerySchema> }>(
    '/:eventId/pricing-rules',
    {
      schema: { params: EventIdParamSchema, querystring: ListPricingRulesQuerySchema },
    },
    async (request, reply) => {
      const { eventId } = request.params;
      const query = request.query;

      // Get event to check ownership
      const event = await getEventById(eventId);
      if (!event) {
        throw app.httpErrors.notFound('Event not found');
      }

      // Check if user is super_admin or accessing their own client's event
      const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
      const isOwnClient = request.user!.clientId === event.clientId;

      if (!isSuperAdmin && !isOwnClient) {
        throw app.httpErrors.forbidden('Insufficient permissions to access this event');
      }

      const rules = await listPricingRules(eventId, { active: query.active });
      return reply.send(rules);
    }
  );

  // PATCH /api/pricing-rules/:id - Update pricing rule
  app.patch<{ Params: { id: string }; Body: UpdatePricingRuleInput }>(
    '/pricing-rules/:id',
    {
      schema: { params: PricingRuleIdParamSchema, body: UpdatePricingRuleSchema },
    },
    async (request, reply) => {
      const { id } = request.params;
      const input = request.body;

      // Get rule to check ownership
      const rule = await getPricingRuleById(id);
      if (!rule) {
        throw app.httpErrors.notFound('Pricing rule not found');
      }

      const event = await getEventById(rule.eventId);
      if (!event) {
        throw app.httpErrors.notFound('Event not found');
      }

      // Check if user is super_admin or updating their own client's event
      const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
      const isOwnClient = request.user!.clientId === event.clientId;

      if (!isSuperAdmin && !isOwnClient) {
        throw app.httpErrors.forbidden('Insufficient permissions to update this pricing rule');
      }

      const updatedRule = await updatePricingRule(id, input);
      return reply.send(updatedRule);
    }
  );

  // DELETE /api/pricing-rules/:id - Delete pricing rule
  app.delete<{ Params: { id: string } }>(
    '/pricing-rules/:id',
    {
      schema: { params: PricingRuleIdParamSchema },
    },
    async (request, reply) => {
      const { id } = request.params;

      // Get rule to check ownership
      const rule = await getPricingRuleById(id);
      if (!rule) {
        throw app.httpErrors.notFound('Pricing rule not found');
      }

      const event = await getEventById(rule.eventId);
      if (!event) {
        throw app.httpErrors.notFound('Event not found');
      }

      // Check if user is super_admin or deleting their own client's event
      const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
      const isOwnClient = request.user!.clientId === event.clientId;

      if (!isSuperAdmin && !isOwnClient) {
        throw app.httpErrors.forbidden('Insufficient permissions to delete this pricing rule');
      }

      await deletePricingRule(id);
      return reply.status(204).send();
    }
  );
}

// ============================================================================
// Event Extras Routes (Protected)
// ============================================================================

export async function eventExtrasRoutes(app: AppInstance): Promise<void> {
  // All routes require authentication
  app.addHook('onRequest', requireAuth);

  // POST /api/events/:eventId/extras - Create event extra
  app.post<{ Params: { eventId: string }; Body: Omit<CreateEventExtraInput, 'eventId'> }>(
    '/:eventId/extras',
    {
      schema: { params: EventIdParamSchema, body: CreateEventExtraSchema.omit({ eventId: true }) },
    },
    async (request, reply) => {
      const { eventId } = request.params;
      const input: CreateEventExtraInput = { ...request.body, eventId };

      // Get event to check ownership
      const event = await getEventById(eventId);
      if (!event) {
        throw app.httpErrors.notFound('Event not found');
      }

      // Check if user is super_admin or creating for their own client
      const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
      const isOwnClient = request.user!.clientId === event.clientId;

      if (!isSuperAdmin && !isOwnClient) {
        throw app.httpErrors.forbidden('Insufficient permissions to create extras for this event');
      }

      const extra = await createEventExtra(input);
      return reply.status(201).send(extra);
    }
  );

  // GET /api/events/:eventId/extras - List event extras
  app.get<{ Params: { eventId: string }; Querystring: z.infer<typeof ListEventExtrasQuerySchema> }>(
    '/:eventId/extras',
    {
      schema: { params: EventIdParamSchema, querystring: ListEventExtrasQuerySchema },
    },
    async (request, reply) => {
      const { eventId } = request.params;
      const query = request.query;

      // Get event to check ownership
      const event = await getEventById(eventId);
      if (!event) {
        throw app.httpErrors.notFound('Event not found');
      }

      // Check if user is super_admin or accessing their own client's event
      const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
      const isOwnClient = request.user!.clientId === event.clientId;

      if (!isSuperAdmin && !isOwnClient) {
        throw app.httpErrors.forbidden('Insufficient permissions to access this event');
      }

      const extras = await listEventExtras(eventId, { active: query.active });
      return reply.send(extras);
    }
  );

  // PATCH /api/extras/:id - Update event extra
  app.patch<{ Params: { id: string }; Body: UpdateEventExtraInput }>(
    '/extras/:id',
    {
      schema: { params: EventExtraIdParamSchema, body: UpdateEventExtraSchema },
    },
    async (request, reply) => {
      const { id } = request.params;
      const input = request.body;

      // Get extra to check ownership
      const extra = await getEventExtraById(id);
      if (!extra) {
        throw app.httpErrors.notFound('Event extra not found');
      }

      const event = await getEventById(extra.eventId);
      if (!event) {
        throw app.httpErrors.notFound('Event not found');
      }

      // Check if user is super_admin or updating their own client's event
      const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
      const isOwnClient = request.user!.clientId === event.clientId;

      if (!isSuperAdmin && !isOwnClient) {
        throw app.httpErrors.forbidden('Insufficient permissions to update this extra');
      }

      const updatedExtra = await updateEventExtra(id, input);
      return reply.send(updatedExtra);
    }
  );

  // DELETE /api/extras/:id - Delete event extra
  app.delete<{ Params: { id: string } }>(
    '/extras/:id',
    {
      schema: { params: EventExtraIdParamSchema },
    },
    async (request, reply) => {
      const { id } = request.params;

      // Get extra to check ownership
      const extra = await getEventExtraById(id);
      if (!extra) {
        throw app.httpErrors.notFound('Event extra not found');
      }

      const event = await getEventById(extra.eventId);
      if (!event) {
        throw app.httpErrors.notFound('Event not found');
      }

      // Check if user is super_admin or deleting their own client's event
      const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
      const isOwnClient = request.user!.clientId === event.clientId;

      if (!isSuperAdmin && !isOwnClient) {
        throw app.httpErrors.forbidden('Insufficient permissions to delete this extra');
      }

      await deleteEventExtra(id);
      return reply.status(204).send();
    }
  );
}

// ============================================================================
// Public Routes (Price Calculation)
// ============================================================================

export async function pricingPublicRoutes(app: AppInstance): Promise<void> {
  // GET /api/events/:eventId/extras/available - Get available extras (public)
  app.get<{ Params: { eventId: string }; Querystring: { formData?: string } }>(
    '/:eventId/extras/available',
    {
      schema: {
        params: EventIdParamSchema,
        querystring: z.object({ formData: z.string().optional() }).strict(),
      },
    },
    async (request, reply) => {
      const { eventId } = request.params;
      const { formData } = request.query;

      let parsedFormData: Record<string, unknown> = {};
      if (formData) {
        try {
          parsedFormData = JSON.parse(formData);
        } catch {
          throw app.httpErrors.badRequest('Invalid formData JSON');
        }
      }

      const extras = await getAvailableExtras(eventId, parsedFormData);
      return reply.send(extras);
    }
  );

  // POST /api/forms/:formId/calculate-price - Calculate price (public)
  app.post<{ Params: { formId: string }; Body: CalculatePriceRequest }>(
    '/:formId/calculate-price',
    {
      schema: { params: FormIdParamSchema, body: CalculatePriceRequestSchema },
    },
    async (request, reply) => {
      const { formId } = request.params;
      const input = request.body;

      // Get form to find event
      const form = await app.prisma.form.findUnique({
        where: { id: formId },
        select: { eventId: true },
      });

      if (!form) {
        throw app.httpErrors.notFound('Form not found');
      }

      const breakdown = await calculatePrice(form.eventId, input);
      return reply.send(breakdown);
    }
  );
}
