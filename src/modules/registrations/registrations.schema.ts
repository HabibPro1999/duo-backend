import { z } from 'zod';
import { AccessSelectionSchema } from '@access';

// ============================================================================
// Enums
// ============================================================================

export const PaymentStatusSchema = z.enum([
  'PENDING',
  'PAID',
  'REFUNDED',
  'WAIVED',
]);

export const PaymentMethodSchema = z.enum([
  'BANK_TRANSFER',
  'ONLINE',
  'CASH',
]);

// ============================================================================
// Create Registration Schema (Public - for form submission)
// ============================================================================

export const CreateRegistrationSchema = z
  .object({
    formId: z.string().uuid(),
    formData: z.record(z.string(), z.any()),

    // Registrant info (extracted from formData for quick access)
    email: z.string().email(),
    firstName: z.string().max(100).optional(),
    lastName: z.string().max(100).optional(),
    phone: z.string().max(50).optional(),

    // Access selections
    accessSelections: z.array(AccessSelectionSchema).optional().default([]),

    // Sponsorship
    sponsorshipCode: z.string().max(50).optional(),
  })
  .strict();

// ============================================================================
// Update Registration Schema (Admin)
// ============================================================================

export const UpdatePaymentSchema = z
  .object({
    paymentStatus: PaymentStatusSchema,
    paidAmount: z.number().int().min(0).optional(),
    paymentMethod: PaymentMethodSchema.optional(),
    paymentReference: z.string().max(200).optional(),
    paymentProofUrl: z.string().url().optional(),
  })
  .strict();

export const UpdateRegistrationSchema = z
  .object({
    paymentStatus: PaymentStatusSchema.optional(),
    paidAmount: z.number().int().min(0).optional(),
    paymentMethod: PaymentMethodSchema.optional(),
    paymentReference: z.string().max(200).optional(),
    paymentProofUrl: z.string().url().optional(),
  })
  .strict();

// ============================================================================
// Query Schemas
// ============================================================================

export const ListRegistrationsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    paymentStatus: PaymentStatusSchema.optional(),
    search: z.string().max(200).optional(),
  })
  .strict();

export const RegistrationIdParamSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

export const EventIdParamSchema = z
  .object({
    eventId: z.string().uuid(),
  })
  .strict();

export const FormIdParamSchema = z
  .object({
    formId: z.string().uuid(),
  })
  .strict();

// ============================================================================
// Note Schemas
// ============================================================================

export const CreateRegistrationNoteSchema = z
  .object({
    content: z.string().min(1).max(5000),
    isInternal: z.boolean().default(true),
  })
  .strict();

// ============================================================================
// Amendment History Schemas (Self-Service Editing)
// ============================================================================

export const FormDataChangeSchema = z.object({
  fieldId: z.string(),
  oldValue: z.any(),
  newValue: z.any(),
});

export const AccessChangeSchema = z.object({
  type: z.enum(['added', 'removed']),
  accessId: z.string().uuid(),
  accessName: z.string(),
  quantity: z.number().int().positive(),
  priceImpact: z.number().int(),
});

export const AmendmentRecordSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.string().datetime(),
  changeType: z.enum(['form_data', 'access_added', 'access_removed', 'mixed']),
  formDataChanges: z.array(FormDataChangeSchema).optional(),
  accessChanges: z.array(AccessChangeSchema).optional(),
  previousTotal: z.number().int(),
  newTotal: z.number().int(),
  previousAdditionalDue: z.number().int(),
  newAdditionalDue: z.number().int(),
  priceBreakdownSnapshot: z.lazy(() => PriceBreakdownSchema),
});

// ============================================================================
// Public Edit Registration Schema (Self-Service)
// ============================================================================

export const PublicEditRegistrationSchema = z
  .object({
    // Form data updates (partial - only changed fields)
    formData: z.record(z.string(), z.any()).optional(),

    // Contact info updates
    firstName: z.string().max(100).optional(),
    lastName: z.string().max(100).optional(),
    phone: z.string().max(50).optional(),
    // Note: email cannot be changed (it's the unique identifier)

    // Access selections (full replacement of current selections)
    accessSelections: z.array(AccessSelectionSchema).optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.formData !== undefined ||
      data.firstName !== undefined ||
      data.lastName !== undefined ||
      data.phone !== undefined ||
      data.accessSelections !== undefined,
    { message: 'At least one field must be provided for update' }
  );

export const RegistrationIdPublicParamSchema = z
  .object({
    registrationId: z.string().uuid(),
  })
  .strict();

// ============================================================================
// Table Column Schemas (for dynamic table rendering)
// ============================================================================

export const TableColumnTypeSchema = z.enum([
  'text',
  'email',
  'phone',
  'number',
  'date',
  'datetime',
  'dropdown',
  'radio',
  'checkbox',
  'currency',
  'status',
  'payment',
  'file',
  'textarea',
]);

export const TableColumnOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
});

export const TableColumnSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: TableColumnTypeSchema,
  options: z.array(TableColumnOptionSchema).optional(),
});

export const RegistrationColumnsResponseSchema = z.object({
  formColumns: z.array(TableColumnSchema),
  fixedColumns: z.array(TableColumnSchema),
});

// ============================================================================
// Price Calculation Integration
// ============================================================================

export const PriceBreakdownSchema = z.object({
  basePrice: z.number(),
  appliedRules: z.array(
    z.object({
      ruleId: z.string(),
      ruleName: z.string(),
      effect: z.number(),
      reason: z.string().optional(),
    })
  ),
  calculatedBasePrice: z.number(),
  accessItems: z.array(
    z.object({
      accessId: z.string(),
      name: z.any(),
      unitPrice: z.number(),
      quantity: z.number(),
      subtotal: z.number(),
    })
  ),
  accessTotal: z.number(),
  subtotal: z.number(),
  sponsorships: z.array(
    z.object({
      code: z.string(),
      amount: z.number(),
      valid: z.boolean(),
    })
  ),
  sponsorshipTotal: z.number(),
  total: z.number(),
  currency: z.string(),
});

// ============================================================================
// Types
// ============================================================================

export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;
export type CreateRegistrationInput = z.infer<typeof CreateRegistrationSchema>;
export type UpdateRegistrationInput = z.infer<typeof UpdateRegistrationSchema>;
export type UpdatePaymentInput = z.infer<typeof UpdatePaymentSchema>;
export type CreateRegistrationNoteInput = z.infer<typeof CreateRegistrationNoteSchema>;
export type ListRegistrationsQuery = z.infer<typeof ListRegistrationsQuerySchema>;
export type PriceBreakdown = z.infer<typeof PriceBreakdownSchema>;
export type PublicEditRegistrationInput = z.infer<typeof PublicEditRegistrationSchema>;
export type AmendmentRecord = z.infer<typeof AmendmentRecordSchema>;
export type FormDataChange = z.infer<typeof FormDataChangeSchema>;
export type AccessChange = z.infer<typeof AccessChangeSchema>;
export type TableColumnType = z.infer<typeof TableColumnTypeSchema>;
export type TableColumnOption = z.infer<typeof TableColumnOptionSchema>;
export type TableColumn = z.infer<typeof TableColumnSchema>;
export type RegistrationColumnsResponse = z.infer<typeof RegistrationColumnsResponseSchema>;
