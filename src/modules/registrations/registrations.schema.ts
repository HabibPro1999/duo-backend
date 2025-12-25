import { z } from 'zod';
import { AccessSelectionSchema } from '@access';

// ============================================================================
// Enums
// ============================================================================

export const RegistrationStatusSchema = z.enum([
  'PENDING',
  'CONFIRMED',
  'CANCELLED',
  'REFUNDED',
]);

export const PaymentStatusSchema = z.enum([
  'PENDING',
  'PAID',
  'FAILED',
  'REFUNDED',
  'WAIVED',
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

export const UpdateRegistrationStatusSchema = z
  .object({
    status: RegistrationStatusSchema,
  })
  .strict();

export const UpdatePaymentSchema = z
  .object({
    paymentStatus: PaymentStatusSchema,
    paidAmount: z.number().int().min(0).optional(),
    paymentMethod: z.string().max(100).optional(),
    paymentReference: z.string().max(200).optional(),
    paymentProofUrl: z.string().url().optional(),
  })
  .strict();

export const UpdateRegistrationSchema = z
  .object({
    status: RegistrationStatusSchema.optional(),
    paymentStatus: PaymentStatusSchema.optional(),
    paidAmount: z.number().int().min(0).optional(),
    paymentMethod: z.string().max(100).optional(),
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
    status: RegistrationStatusSchema.optional(),
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

export type RegistrationStatus = z.infer<typeof RegistrationStatusSchema>;
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;
export type CreateRegistrationInput = z.infer<typeof CreateRegistrationSchema>;
export type UpdateRegistrationInput = z.infer<typeof UpdateRegistrationSchema>;
export type UpdatePaymentInput = z.infer<typeof UpdatePaymentSchema>;
export type CreateRegistrationNoteInput = z.infer<typeof CreateRegistrationNoteSchema>;
export type ListRegistrationsQuery = z.infer<typeof ListRegistrationsQuerySchema>;
export type PriceBreakdown = z.infer<typeof PriceBreakdownSchema>;
