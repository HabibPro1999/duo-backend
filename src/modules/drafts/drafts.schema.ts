import { z } from 'zod';

// ============================================================================
// Access Selection Schema (for drafts)
// ============================================================================

export const DraftAccessSelectionSchema = z
  .object({
    accessId: z.string().uuid(),
    quantity: z.number().int().min(1).default(1),
  })
  .strict();

// ============================================================================
// Create/Update Draft Schema
// ============================================================================

export const SaveDraftSchema = z
  .object({
    formId: z.string().uuid(),
    formData: z.record(z.string(), z.any()),
    currentStep: z.number().int().min(0).default(0),
    email: z.string().email().optional(),
    accessSelections: z.array(DraftAccessSelectionSchema).optional(),
    sponsorshipCode: z.string().max(50).optional(),
  })
  .strict();

export const UpdateDraftSchema = z
  .object({
    formData: z.record(z.string(), z.any()).optional(),
    currentStep: z.number().int().min(0).optional(),
    email: z.string().email().optional(),
    accessSelections: z.array(DraftAccessSelectionSchema).optional(),
    sponsorshipCode: z.string().max(50).optional(),
  })
  .strict();

// ============================================================================
// Query Schemas
// ============================================================================

export const SessionTokenParamSchema = z
  .object({
    sessionToken: z.string().min(32).max(64),
  })
  .strict();

export const GetDraftQuerySchema = z
  .object({
    email: z.string().email().optional(),
    formId: z.string().uuid().optional(),
  })
  .strict();

// ============================================================================
// Response Schemas
// ============================================================================

export const DraftResponseSchema = z.object({
  id: z.string(),
  formId: z.string(),
  sessionToken: z.string(),
  formData: z.any(),
  currentStep: z.number(),
  email: z.string().nullable(),
  accessSelections: z.any().nullable(),
  sponsorshipCode: z.string().nullable(),
  expiresAt: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const DraftLookupResponseSchema = z.object({
  hasDraft: z.boolean(),
  sessionToken: z.string(),
  currentStep: z.number(),
  updatedAt: z.date(),
});

// ============================================================================
// Types
// ============================================================================

export type DraftAccessSelection = z.infer<typeof DraftAccessSelectionSchema>;
export type SaveDraftInput = z.infer<typeof SaveDraftSchema>;
export type UpdateDraftInput = z.infer<typeof UpdateDraftSchema>;
export type GetDraftQuery = z.infer<typeof GetDraftQuerySchema>;
export type DraftResponse = z.infer<typeof DraftResponseSchema>;
export type DraftLookupResponse = z.infer<typeof DraftLookupResponseSchema>;
