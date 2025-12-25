import { randomUUID } from 'crypto';
import { prisma } from '@/database/client.js';
import { AppError } from '@shared/errors/app-error.js';
import { ErrorCodes } from '@shared/errors/error-codes.js';
import { eventExists } from '@events';
import { paginate, getSkip, type PaginatedResult } from '@shared/utils/pagination.js';
import type { CreateFormInput, UpdateFormInput, ListFormsQuery, FormSchemaJson } from './forms.schema.js';
import type { Form, Prisma, Event, Client, EventAccess, EventPricing } from '@prisma/client';

type FormWithRelations = Form & {
  event: Event & {
    client: Pick<Client, 'id' | 'name' | 'logo' | 'primaryColor'>;
    pricing: EventPricing | null; // Includes embedded rules in pricing.rules
    access: EventAccess[];
  };
};

/**
 * Generate default form schema with standard registration fields.
 */
function createDefaultSchema(): FormSchemaJson {
  return {
    steps: [
      {
        id: `step_${randomUUID()}`,
        title: 'Informations personnelles',
        description: 'Tous les champs marqués * sont obligatoires',
        fields: [
          {
            id: `text_${randomUUID()}`,
            type: 'text',
            label: 'Prénom',
            placeholder: 'Votre prénom',
            required: true,
            width: 'half',
          },
          {
            id: `text_${randomUUID()}`,
            type: 'text',
            label: 'Nom',
            placeholder: 'Votre nom',
            required: true,
            width: 'half',
          },
          {
            id: `email_${randomUUID()}`,
            type: 'email',
            label: 'Email',
            placeholder: 'votre.email@exemple.com',
            required: true,
            width: 'full',
          },
          {
            id: `phone_${randomUUID()}`,
            type: 'phone',
            label: 'Téléphone',
            placeholder: '+216 XX XXX XXX',
            required: true,
            width: 'full',
            phoneFormat: 'TN',
          },
          {
            id: `text_${randomUUID()}`,
            type: 'text',
            label: 'Lieu de travail',
            placeholder: 'Nom de votre entreprise ou établissement',
            required: true,
            width: 'full',
          },
        ],
      },
    ],
  };
}

/**
 * Create a new form.
 * Each event can only have one form (enforced by unique constraint on eventId).
 * If no schema is provided, uses default fields (Prénom, Nom, Email, Téléphone, Lieu de travail).
 */
export async function createForm(input: CreateFormInput): Promise<Form> {
  const { eventId, name, schema, successTitle, successMessage } = input;

  // Validate that event exists
  const isValidEvent = await eventExists(eventId);
  if (!isValidEvent) {
    throw new AppError('Event not found', 404, true, ErrorCodes.NOT_FOUND);
  }

  // Check if event already has a form (enforced by unique constraint, but provide better error)
  const existingForm = await prisma.form.findUnique({ where: { eventId } });
  if (existingForm) {
    throw new AppError(
      'Event already has a form. Update the existing form instead.',
      409,
      true,
      ErrorCodes.CONFLICT
    );
  }

  // Use provided schema or generate default
  const formSchema = schema ?? createDefaultSchema();

  return prisma.form.create({
    data: {
      eventId,
      name,
      schema: formSchema as Prisma.InputJsonValue,
      successTitle: successTitle ?? null,
      successMessage: successMessage ?? null,
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
 * Get form by event slug (for public access).
 * Only returns forms for OPEN events with event and client data.
 */
export async function getFormByEventSlug(eventSlug: string): Promise<FormWithRelations | null> {
  // Find the form via event slug, including all related data
  const form = await prisma.form.findFirst({
    where: {
      event: {
        slug: eventSlug,
      },
    },
    include: {
      event: {
        include: {
          client: {
            select: {
              id: true,
              name: true,
              logo: true,
              primaryColor: true,
            },
          },
          pricing: true, // Includes embedded rules in pricing.rules
          access: {
            where: { active: true },
            orderBy: [{ startsAt: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
          },
        },
      },
    },
  });

  // Only return forms for OPEN events
  if (!form || form.event.status !== 'OPEN') {
    return null;
  }

  return form;
}

/**
 * Update form.
 * Auto-increments schemaVersion when the schema JSON changes.
 */
export async function updateForm(id: string, input: UpdateFormInput): Promise<Form> {
  // Check if form exists
  const form = await prisma.form.findUnique({ where: { id } });
  if (!form) {
    throw new AppError('Form not found', 404, true, ErrorCodes.NOT_FOUND);
  }

  // Prepare update data
  const updateData: Prisma.FormUpdateInput = {};
  if (input.name !== undefined) updateData.name = input.name;
  if (input.successTitle !== undefined) updateData.successTitle = input.successTitle;
  if (input.successMessage !== undefined) updateData.successMessage = input.successMessage;

  // Check if schema is being updated and has actually changed
  if (input.schema !== undefined) {
    const currentSchemaStr = JSON.stringify(form.schema);
    const newSchemaStr = JSON.stringify(input.schema);

    if (currentSchemaStr !== newSchemaStr) {
      updateData.schema = input.schema as Prisma.InputJsonValue;
      // Auto-increment schema version when schema changes
      updateData.schemaVersion = { increment: 1 };
    }
  }

  return prisma.form.update({
    where: { id },
    data: updateData,
  });
}

/**
 * List forms with pagination and filters.
 */
export async function listForms(query: ListFormsQuery): Promise<PaginatedResult<Form>> {
  const { page, limit, eventId, search } = query;
  const skip = getSkip({ page, limit });

  const where: Prisma.FormWhereInput = {};

  if (eventId) where.eventId = eventId;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.form.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.form.count({ where }),
  ]);

  return paginate(data, total, { page, limit });
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
