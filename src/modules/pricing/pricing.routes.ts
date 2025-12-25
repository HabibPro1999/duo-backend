import { requireAuth } from '@shared/middleware/auth.middleware.js';
import { getEventById } from '@events';
import {
  createPricingRule,
  updatePricingRule,
  deletePricingRule,
  listPricingRules,
  getPricingRuleById,
  calculatePrice,
} from './pricing.service.js';
import {
  CreatePricingRuleSchema,
  UpdatePricingRuleSchema,
  ListPricingRulesQuerySchema,
  PricingRuleIdParamSchema,
  CalculatePriceRequestSchema,
  type CreatePricingRuleInput,
  type UpdatePricingRuleInput,
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
// Public Routes (Price Calculation)
// ============================================================================

export async function pricingPublicRoutes(app: AppInstance): Promise<void> {
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
