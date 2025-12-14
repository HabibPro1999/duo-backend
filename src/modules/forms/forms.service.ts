import { prisma } from '@/database/client.js';
import { AppError } from '@shared/errors/app-error.js';
import { ErrorCodes } from '@shared/errors/error-codes.js';
import { eventExists } from '@events';
import type { CreateFormInput, UpdateFormInput, ListFormsQuery } from './forms.schema.js';
import type { Form, Prisma, Event, Client } from '@prisma/client';

type FormWithRelations = Form & {
  event: Event & {
    client: Pick<Client, 'id' | 'name' | 'slug' | 'logo' | 'primaryColor'>;
  };
};

/**
 * Create a new form.
 */
export async function createForm(input: CreateFormInput): Promise<Form> {
  const { eventId, name, slug, schema, basePrice, currency, successTitle, successMessage, status } =
    input;

  // Validate that event exists
  const isValidEvent = await eventExists(eventId);
  if (!isValidEvent) {
    throw new AppError('Event not found', 404, true, ErrorCodes.NOT_FOUND);
  }

  // Check if slug is globally unique (not just per event)
  const existing = await prisma.form.findUnique({
    where: { slug },
  });
  if (existing) {
    throw new AppError(
      'Form with this slug already exists',
      409,
      true,
      ErrorCodes.CONFLICT
    );
  }

  return prisma.form.create({
    data: {
      eventId,
      name,
      slug,
      schema: schema as Prisma.InputJsonValue,
      basePrice: basePrice ?? 0,
      currency: currency ?? 'MAD',
      successTitle: successTitle as Prisma.InputJsonValue ?? null,
      successMessage: successMessage as Prisma.InputJsonValue ?? null,
      status: status ?? 'DRAFT',
    },
  });
}

/**
 * Get form by ID.
 */
export async function getFormById(id: string): Promise<Form | null> {
  return prisma.form.findUnique({ where: { id } });
}

/**
 * Get form by slug (for public access).
 * Only returns PUBLISHED and active forms with event and client data.
 */
export async function getFormBySlug(slug: string): Promise<FormWithRelations | null> {
  const form = await prisma.form.findUnique({
    where: { slug },
    include: {
      event: {
        include: {
          client: {
            select: {
              id: true,
              name: true,
              slug: true,
              logo: true,
              primaryColor: true,
            },
          },
        },
      },
    },
  });

  // Only return PUBLISHED and active forms
  if (!form || form.status !== 'PUBLISHED' || !form.active) {
    return null;
  }

  return form;
}

/**
 * Update form.
 */
export async function updateForm(id: string, input: UpdateFormInput): Promise<Form> {
  // Check if form exists
  const form = await prisma.form.findUnique({ where: { id } });
  if (!form) {
    throw new AppError('Form not found', 404, true, ErrorCodes.NOT_FOUND);
  }

  // If slug is being updated, check global uniqueness
  if (input.slug && input.slug !== form.slug) {
    const existing = await prisma.form.findUnique({
      where: { slug: input.slug },
    });
    if (existing) {
      throw new AppError(
        'Form with this slug already exists',
        409,
        true,
        ErrorCodes.CONFLICT
      );
    }
  }

  // Prepare update data
  const updateData: Prisma.FormUpdateInput = {};
  if (input.name !== undefined) updateData.name = input.name;
  if (input.slug !== undefined) updateData.slug = input.slug;
  if (input.schema !== undefined) updateData.schema = input.schema as Prisma.InputJsonValue;
  if (input.basePrice !== undefined) updateData.basePrice = input.basePrice;
  if (input.currency !== undefined) updateData.currency = input.currency;
  if (input.successTitle !== undefined) updateData.successTitle = input.successTitle as Prisma.InputJsonValue;
  if (input.successMessage !== undefined) updateData.successMessage = input.successMessage as Prisma.InputJsonValue;
  if (input.status !== undefined) updateData.status = input.status;
  if (input.active !== undefined) updateData.active = input.active;

  return prisma.form.update({
    where: { id },
    data: updateData,
  });
}

/**
 * List forms with pagination and filters.
 */
export async function listForms(query: ListFormsQuery): Promise<{
  data: Form[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}> {
  const { page, limit, eventId, status, search } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.FormWhereInput = {};

  if (eventId) where.eventId = eventId;
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { slug: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.form.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.form.count({ where }),
  ]);

  return {
    data,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

/**
 * Delete form.
 */
export async function deleteForm(id: string): Promise<void> {
  // Check if form exists
  const form = await prisma.form.findUnique({ where: { id } });
  if (!form) {
    throw new AppError('Form not found', 404, true, ErrorCodes.NOT_FOUND);
  }

  await prisma.form.delete({ where: { id } });
}

/**
 * Helper function to check if form exists (for validation in other modules).
 */
export async function formExists(id: string): Promise<boolean> {
  const count = await prisma.form.count({ where: { id } });
  return count > 0;
}

/**
 * Helper function to get form's client ID via event (for ownership checks).
 */
export async function getFormClientId(id: string): Promise<string | null> {
  const form = await prisma.form.findUnique({
    where: { id },
    select: {
      event: {
        select: {
          clientId: true,
        },
      },
    },
  });
  return form?.event.clientId ?? null;
}
