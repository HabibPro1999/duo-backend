import { z } from 'zod';

// ============================================================================
// Shared Types
// ============================================================================

export const MultiLangTextSchema = z.object({
  fr: z.string(),
  en: z.string().optional(),
  ar: z.string().optional(),
});

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
// Pricing Rules Schemas
// ============================================================================

export const CreatePricingRuleSchema = z
  .object({
    eventId: z.string().uuid(),
    name: z.string().min(1).max(200),
    description: MultiLangTextSchema.optional().nullable(),
    ruleType: z.enum(['BASE_PRICE', 'MODIFIER']),
    priority: z.number().int().min(0).default(0),
    conditions: z.array(PricingConditionSchema).min(1),
    conditionLogic: z.enum(['AND', 'OR']).default('AND'),
    validFrom: z.coerce.date().optional().nullable(),
    validTo: z.coerce.date().optional().nullable(),
    priceType: z.enum(['FIXED', 'PERCENTAGE']).default('FIXED'),
    priceValue: z.number().int(),
    active: z.boolean().default(true),
  })
  .strict();

export const UpdatePricingRuleSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: MultiLangTextSchema.optional().nullable(),
    ruleType: z.enum(['BASE_PRICE', 'MODIFIER']).optional(),
    priority: z.number().int().min(0).optional(),
    conditions: z.array(PricingConditionSchema).min(1).optional(),
    conditionLogic: z.enum(['AND', 'OR']).optional(),
    validFrom: z.coerce.date().optional().nullable(),
    validTo: z.coerce.date().optional().nullable(),
    priceType: z.enum(['FIXED', 'PERCENTAGE']).optional(),
    priceValue: z.number().int().optional(),
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
// Event Extras Schemas
// ============================================================================

export const CreateEventExtraSchema = z
  .object({
    eventId: z.string().uuid(),
    name: MultiLangTextSchema,
    description: MultiLangTextSchema.optional().nullable(),
    price: z.number().int().min(0),
    currency: z.string().length(3).default('MAD'),
    maxCapacity: z.number().int().positive().optional().nullable(),
    availableFrom: z.coerce.date().optional().nullable(),
    availableTo: z.coerce.date().optional().nullable(),
    conditions: z.array(PricingConditionSchema).optional().nullable(),
    conditionLogic: z.enum(['AND', 'OR']).default('AND'),
    sortOrder: z.number().int().default(0),
    active: z.boolean().default(true),
  })
  .strict();

export const UpdateEventExtraSchema = z
  .object({
    name: MultiLangTextSchema.optional(),
    description: MultiLangTextSchema.optional().nullable(),
    price: z.number().int().min(0).optional(),
    currency: z.string().length(3).optional(),
    maxCapacity: z.number().int().positive().optional().nullable(),
    availableFrom: z.coerce.date().optional().nullable(),
    availableTo: z.coerce.date().optional().nullable(),
    conditions: z.array(PricingConditionSchema).optional().nullable(),
    conditionLogic: z.enum(['AND', 'OR']).optional(),
    sortOrder: z.number().int().optional(),
    active: z.boolean().optional(),
  })
  .strict();

export const ListEventExtrasQuerySchema = z
  .object({
    active: z.preprocess(
      (v) => (v === 'true' ? true : v === 'false' ? false : undefined),
      z.boolean().optional()
    ),
  })
  .strict();

export const EventExtraIdParamSchema = z
  .object({
    id: z.string().uuid(),
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
  ruleType: z.enum(['BASE_PRICE', 'MODIFIER']),
  priority: z.number(),
  conditions: z.any(),
  conditionLogic: z.string(),
  validFrom: z.date().nullable(),
  validTo: z.date().nullable(),
  priceType: z.enum(['FIXED', 'PERCENTAGE']),
  priceValue: z.number(),
  active: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const EventExtraResponseSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  name: z.any(),
  description: z.any().nullable(),
  price: z.number(),
  currency: z.string(),
  maxCapacity: z.number().nullable(),
  registeredCount: z.number(),
  availableFrom: z.date().nullable(),
  availableTo: z.date().nullable(),
  conditions: z.any().nullable(),
  conditionLogic: z.string(),
  sortOrder: z.number(),
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
export type CreateEventExtraInput = z.infer<typeof CreateEventExtraSchema>;
export type UpdateEventExtraInput = z.infer<typeof UpdateEventExtraSchema>;
export type CalculatePriceRequest = z.infer<typeof CalculatePriceRequestSchema>;
export type PriceBreakdown = z.infer<typeof PriceBreakdownSchema>;
export type SelectedExtra = z.infer<typeof SelectedExtraSchema>;
