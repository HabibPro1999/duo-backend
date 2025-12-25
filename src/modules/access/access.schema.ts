import { z } from 'zod';

// ============================================================================
// Shared Types
// ============================================================================

export const AccessConditionSchema = z
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
// Enums
// ============================================================================

export const AccessTypeSchema = z.enum([
  'WORKSHOP',
  'DINNER',
  'SESSION',
  'NETWORKING',
  'ACCOMMODATION',
  'TRANSPORT',
  'OTHER',
]);

// ============================================================================
// Create/Update Schemas
// ============================================================================

export const CreateEventAccessSchema = z
  .object({
    eventId: z.string().uuid(),
    type: AccessTypeSchema.default('OTHER'),
    name: z.string().min(1).max(200),
    description: z.string().max(1000).optional().nullable(),
    location: z.string().max(500).optional().nullable(),

    // Scheduling
    startsAt: z.coerce.date().optional().nullable(),
    endsAt: z.coerce.date().optional().nullable(),

    // Pricing
    price: z.number().int().min(0).default(0),
    currency: z.string().length(3).default('TND'),

    // Capacity
    maxCapacity: z.number().int().positive().optional().nullable(),
    waitlistEnabled: z.boolean().default(false),
    maxWaitlist: z.number().int().positive().optional().nullable(),

    // Availability
    availableFrom: z.coerce.date().optional().nullable(),
    availableTo: z.coerce.date().optional().nullable(),

    // Conditions (form-based prerequisites)
    conditions: z.array(AccessConditionSchema).optional().nullable(),
    conditionLogic: z.enum(['AND', 'OR']).default('AND'),

    // Access-based prerequisites (array of access IDs)
    requiredAccessIds: z.array(z.string().uuid()).optional().default([]),

    // Display
    sortOrder: z.number().int().default(0),
    active: z.boolean().default(true),
  })
  .strict()
  .refine(
    (data) => {
      if (data.startsAt && data.endsAt) {
        return data.endsAt >= data.startsAt;
      }
      return true;
    },
    { message: 'End time must be after start time', path: ['endsAt'] }
  )
  .refine(
    (data) => {
      if (data.waitlistEnabled && data.maxCapacity === null) {
        return false;
      }
      return true;
    },
    { message: 'Waitlist requires maxCapacity to be set', path: ['waitlistEnabled'] }
  );

export const UpdateEventAccessSchema = z
  .object({
    type: AccessTypeSchema.optional(),
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(1000).optional().nullable(),
    location: z.string().max(500).optional().nullable(),
    startsAt: z.coerce.date().optional().nullable(),
    endsAt: z.coerce.date().optional().nullable(),
    price: z.number().int().min(0).optional(),
    currency: z.string().length(3).optional(),
    maxCapacity: z.number().int().positive().optional().nullable(),
    waitlistEnabled: z.boolean().optional(),
    maxWaitlist: z.number().int().positive().optional().nullable(),
    availableFrom: z.coerce.date().optional().nullable(),
    availableTo: z.coerce.date().optional().nullable(),
    conditions: z.array(AccessConditionSchema).optional().nullable(),
    conditionLogic: z.enum(['AND', 'OR']).optional(),
    requiredAccessIds: z.array(z.string().uuid()).optional(),
    sortOrder: z.number().int().optional(),
    active: z.boolean().optional(),
  })
  .strict();

// ============================================================================
// Query Schemas
// ============================================================================

export const ListEventAccessQuerySchema = z
  .object({
    active: z.preprocess(
      (v) => (v === 'true' ? true : v === 'false' ? false : undefined),
      z.boolean().optional()
    ),
    type: AccessTypeSchema.optional(),
  })
  .strict();

export const EventAccessIdParamSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

export const EventIdParamSchema = z
  .object({
    eventId: z.string().uuid(),
  })
  .strict();

// ============================================================================
// Grouped Access Response (for frontend)
// ============================================================================

export const AccessGroupSchema = z.object({
  startsAt: z.date().nullable(),
  endsAt: z.date().nullable(),
  selectionType: z.enum(['single', 'multiple']),
  items: z.array(z.any()),
});

export const GroupedAccessResponseSchema = z.object({
  groups: z.array(AccessGroupSchema),
  ungrouped: z.array(z.any()),
});

// ============================================================================
// Selection Schema (for registration)
// ============================================================================

export const AccessSelectionSchema = z
  .object({
    accessId: z.string().uuid(),
    quantity: z.number().int().min(1).default(1),
  })
  .strict();

// ============================================================================
// Public API Schemas
// ============================================================================

export const GetGroupedAccessBodySchema = z
  .object({
    formData: z.record(z.string(), z.any()).optional().default({}),
    selectedAccessIds: z.array(z.string().uuid()).optional().default([]),
  })
  .strict();

export const ValidateAccessSelectionsBodySchema = z
  .object({
    formData: z.record(z.string(), z.any()),
    selections: z.array(AccessSelectionSchema),
  })
  .strict();

// ============================================================================
// Types
// ============================================================================

export type AccessType = z.infer<typeof AccessTypeSchema>;
export type AccessCondition = z.infer<typeof AccessConditionSchema>;
export type CreateEventAccessInput = z.infer<typeof CreateEventAccessSchema>;
export type UpdateEventAccessInput = z.infer<typeof UpdateEventAccessSchema>;
export type AccessSelection = z.infer<typeof AccessSelectionSchema>;
export type AccessGroup = z.infer<typeof AccessGroupSchema>;
export type GroupedAccessResponse = z.infer<typeof GroupedAccessResponseSchema>;
export type GetGroupedAccessBody = z.infer<typeof GetGroupedAccessBodySchema>;
export type ValidateAccessSelectionsBody = z.infer<typeof ValidateAccessSelectionsBodySchema>;
