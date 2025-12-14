import { z } from 'zod';

// ============================================================================
// Request Schemas
// ============================================================================

export const CreateClientSchema = z
  .object({
    name: z.string().min(1).max(100),
    slug: z
      .string()
      .min(1)
      .max(50)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens'),
    logo: z.string().url().optional().nullable(),
    primaryColor: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/, 'Primary color must be a valid hex color')
      .optional()
      .nullable(),
    email: z.string().email().optional().nullable(),
    phone: z.string().min(1).max(20).optional().nullable(),
  })
  .strict();

export const UpdateClientSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    slug: z
      .string()
      .min(1)
      .max(50)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens')
      .optional(),
    logo: z.string().url().optional().nullable(),
    primaryColor: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/, 'Primary color must be a valid hex color')
      .optional()
      .nullable(),
    email: z.string().email().optional().nullable(),
    phone: z.string().min(1).max(20).optional().nullable(),
    active: z.boolean().optional(),
  })
  .strict();

export const ListClientsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    active: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
    search: z.string().optional(),
  })
  .strict();

export const ClientIdParamSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

// ============================================================================
// Response Schemas
// ============================================================================

export const ClientResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  logo: z.string().nullable(),
  primaryColor: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  active: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const ClientsListResponseSchema = z.object({
  data: z.array(ClientResponseSchema),
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

export type CreateClientInput = z.infer<typeof CreateClientSchema>;
export type UpdateClientInput = z.infer<typeof UpdateClientSchema>;
export type ListClientsQuery = z.infer<typeof ListClientsQuerySchema>;
export type ClientResponse = z.infer<typeof ClientResponseSchema>;
export type ClientsListResponse = z.infer<typeof ClientsListResponseSchema>;
