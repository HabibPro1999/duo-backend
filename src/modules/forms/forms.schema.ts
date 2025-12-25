import { z } from 'zod';

// ============================================================================
// Field Schemas
// ============================================================================

export const FieldTypeSchema = z.enum([
  'text',
  'email',
  'phone',
  'number',
  'textarea',
  'dropdown',
  'radio',
  'checkbox',
  'date',
  'file',
  'heading',
  'paragraph',
]);

export const FieldOptionSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    priceModifier: z.number().optional(),
  })
  .strict();

export const ConditionOperatorSchema = z.enum([
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'greater_than',
  'less_than',
  'is_empty',
  'is_not_empty',
]);

export const FieldConditionSchema = z
  .object({
    fieldId: z.string(),
    operator: ConditionOperatorSchema,
    value: z.union([z.string(), z.number(), z.boolean()]).optional(),
  })
  .strict();

export const FieldValidationSchema = z
  .object({
    required: z.boolean().optional(),
    minLength: z.number().int().positive().optional(),
    maxLength: z.number().int().positive().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().optional(),
    fileTypes: z.array(z.string()).optional(),
    maxFileSize: z.number().int().positive().optional(),
  })
  .strict();

export const FormFieldSchema = z
  .object({
    id: z.string(),
    type: FieldTypeSchema,
    label: z.string().optional(),
    placeholder: z.string().optional(),
    helpText: z.string().optional(),
    options: z.array(FieldOptionSchema).optional(),
    validation: FieldValidationSchema.optional(),
    conditions: z.array(FieldConditionSchema).optional(),
    gridColumn: z.string().optional(),
  })
  .strict();

// ============================================================================
// Form Step Schema
// ============================================================================

export const FormStepSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string().optional(),
    fields: z.array(FormFieldSchema),
  })
  .strict();

// ============================================================================
// Complete Form Schema (JSONB)
// ============================================================================

// Use permissive schema for JSONB - frontend defines the structure
export const FormSchemaJsonSchema = z.object({
  steps: z.array(z.any()),
}).passthrough();

// ============================================================================
// Request Schemas
// ============================================================================

export const CreateFormSchema = z
  .object({
    eventId: z.string().uuid(),
    name: z.string().min(1).max(200),
    schema: FormSchemaJsonSchema,
    successTitle: z.string().optional().nullable(),
    successMessage: z.string().optional().nullable(),
  })
  .strict();

export const UpdateFormSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    schema: FormSchemaJsonSchema.optional(),
    successTitle: z.string().optional().nullable(),
    successMessage: z.string().optional().nullable(),
  })
  .strict();

export const ListFormsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    eventId: z.string().uuid().optional(),
    search: z.string().optional(),
  })
  .strict();

export const FormIdParamSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

// ============================================================================
// Response Schemas
// ============================================================================

export const FormResponseSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  name: z.string(),
  schema: z.any(), // JSONB - use any for response
  schemaVersion: z.number(),
  successTitle: z.any().nullable(),
  successMessage: z.any().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const FormWithRelationsResponseSchema = FormResponseSchema.extend({
  event: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    status: z.enum(['CLOSED', 'OPEN', 'ARCHIVED']),
    startDate: z.date(),
    endDate: z.date(),
    location: z.string().nullable(),
    basePrice: z.number(),
    currency: z.string(),
    client: z.object({
      id: z.string(),
      name: z.string(),
      logo: z.string().nullable(),
      primaryColor: z.string().nullable(),
    }),
  }),
});

export const FormsListResponseSchema = z.object({
  data: z.array(FormResponseSchema),
  meta: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

// ============================================================================
// Types
// ============================================================================

export type FieldType = z.infer<typeof FieldTypeSchema>;
export type FieldOption = z.infer<typeof FieldOptionSchema>;
export type ConditionOperator = z.infer<typeof ConditionOperatorSchema>;
export type FieldCondition = z.infer<typeof FieldConditionSchema>;
export type FieldValidation = z.infer<typeof FieldValidationSchema>;
export type FormField = z.infer<typeof FormFieldSchema>;
export type FormStep = z.infer<typeof FormStepSchema>;
export type FormSchemaJson = z.infer<typeof FormSchemaJsonSchema>;
export type CreateFormInput = z.infer<typeof CreateFormSchema>;
export type UpdateFormInput = z.infer<typeof UpdateFormSchema>;
export type ListFormsQuery = z.infer<typeof ListFormsQuerySchema>;
export type FormResponse = z.infer<typeof FormResponseSchema>;
export type FormWithRelationsResponse = z.infer<typeof FormWithRelationsResponseSchema>;
export type FormsListResponse = z.infer<typeof FormsListResponseSchema>;
