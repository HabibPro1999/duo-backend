import { z } from 'zod';

// ============================================================================
// Shared Types
// ============================================================================

export const PricingConditionSchema = z
  .object({
    fieldId: z.string().min(1),
    operator: z.enum([
      'equals',
      'not_equals',
      'contains',
      'greater_than',
      'less_than',
      'in',
      'not_in',
    ]),
    value: z.union([z.string(), z.number(), z.array(z.string())]),
  })
  .strict();

// ============================================================================
// Pricing Rules Schemas (Simplified)
// Rules define conditional base price overrides: if conditions match → use this price
// ============================================================================

export const CreatePricingRuleSchema = z
  .object({
    eventId: z.string().uuid(),
    name: z.string().min(1).max(200),
    description: z.string().max(1000).optional().nullable(),
    priority: z.number().int().min(0).default(0),
    conditions: z.array(PricingConditionSchema).min(1),
    conditionLogic: z.enum(['AND', 'OR']).default('AND'),
    price: z.number().int().min(0), // Fixed price when conditions match
    active: z.boolean().default(true),
  })
  .strict();

export const UpdatePricingRuleSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(1000).optional().nullable(),
    priority: z.number().int().min(0).optional(),
    conditions: z.array(PricingConditionSchema).min(1).optional(),
    conditionLogic: z.enum(['AND', 'OR']).optional(),
    price: z.number().int().min(0).optional(),
    active: z.boolean().optional(),
  })
  .strict();

export const ListPricingRulesQuerySchema = z
  .object({
    active: z.preprocess(
      (v) => (v === 'true' ? true : v === 'false' ? false : undefined),
      z.boolean().optional()
    ),
  })
  .strict();

export const PricingRuleIdParamSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

// ============================================================================
// Event Pricing Schemas (Base price configuration per event)
// ============================================================================

export const CreateEventPricingSchema = z
  .object({
    eventId: z.string().uuid(),
    basePrice: z.number().int().min(0).default(0),
    currency: z.string().length(3).default('TND'),
  })
  .strict();

export const UpdateEventPricingSchema = z
  .object({
    basePrice: z.number().int().min(0).optional(),
    currency: z.string().length(3).optional(),
  })
  .strict();

export const EventPricingResponseSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  basePrice: z.number(),
  currency: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const EventIdParamSchema = z
  .object({
    eventId: z.string().uuid(),
  })
  .strict();

// ============================================================================
// Price Calculation Schemas
// ============================================================================

export const SelectedExtraSchema = z
  .object({
    extraId: z.string().uuid(),
    quantity: z.number().int().min(1).default(1),
  })
  .strict();

export const CalculatePriceRequestSchema = z
  .object({
    formData: z.record(z.string(), z.any()),
    selectedExtras: z.array(SelectedExtraSchema).optional().default([]),
    sponsorshipCodes: z.array(z.string()).optional().default([]),
  })
  .strict();

export const AppliedRuleSchema = z.object({
  ruleId: z.string(),
  ruleName: z.string(),
  effect: z.number(),
  reason: z.string().optional(),
});

export const ExtraLineItemSchema = z.object({
  extraId: z.string(),
  name: z.any(),
  unitPrice: z.number(),
  quantity: z.number(),
  subtotal: z.number(),
});

export const SponsorshipLineSchema = z.object({
  code: z.string(),
  amount: z.number(),
  valid: z.boolean(),
});

export const PriceBreakdownSchema = z.object({
  basePrice: z.number(),
  appliedRules: z.array(AppliedRuleSchema),
  calculatedBasePrice: z.number(),
  extras: z.array(ExtraLineItemSchema),
  extrasTotal: z.number(),
  subtotal: z.number(),
  sponsorships: z.array(SponsorshipLineSchema),
  sponsorshipTotal: z.number(),
  total: z.number(),
  currency: z.string(),
});

// ============================================================================
// Response Schemas
// ============================================================================

export const PricingRuleResponseSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  name: z.string(),
  description: z.any().nullable(),
  priority: z.number(),
  conditions: z.any(),
  conditionLogic: z.string(),
  price: z.number(),
  active: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// ============================================================================
// Types
// ============================================================================

export type PricingCondition = z.infer<typeof PricingConditionSchema>;
export type CreatePricingRuleInput = z.infer<typeof CreatePricingRuleSchema>;
export type UpdatePricingRuleInput = z.infer<typeof UpdatePricingRuleSchema>;
export type CalculatePriceRequest = z.infer<typeof CalculatePriceRequestSchema>;
export type PriceBreakdown = z.infer<typeof PriceBreakdownSchema>;
export type SelectedExtra = z.infer<typeof SelectedExtraSchema>;
export type CreateEventPricingInput = z.infer<typeof CreateEventPricingSchema>;
export type UpdateEventPricingInput = z.infer<typeof UpdateEventPricingSchema>;
export type EventPricingResponse = z.infer<typeof EventPricingResponseSchema>;
