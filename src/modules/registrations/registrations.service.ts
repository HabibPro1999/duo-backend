import { prisma } from '@/database/client.js';
import { AppError } from '@shared/errors/app-error.js';
import { ErrorCodes } from '@shared/errors/error-codes.js';
import { paginate, getSkip, type PaginatedResult } from '@shared/utils/pagination.js';
import { incrementRegisteredCount, decrementRegisteredCount } from '@events';
import {
  validateAccessSelections,
  reserveAccessSpot,
  releaseAccessSpot,
} from '@access';
import type {
  CreateRegistrationInput,
  UpdateRegistrationInput,
  UpdatePaymentInput,
  CreateRegistrationNoteInput,
  ListRegistrationsQuery,
  PriceBreakdown,
} from './registrations.schema.js';
import type { Registration, RegistrationNote, Prisma } from '@prisma/client';

// ============================================================================
// Types
// ============================================================================

type RegistrationWithRelations = Registration & {
  accessSelections: Array<{
    id: string;
    accessId: string;
    unitPrice: number;
    quantity: number;
    subtotal: number;
    access: {
      id: string;
      name: string;
      type: string;
      startsAt: Date | null;
      endsAt: Date | null;
    };
  }>;
  notes?: Array<{
    id: string;
    content: string;
    isInternal: boolean;
    createdAt: Date;
    author: { id: string; name: string };
  }>;
  form: {
    id: string;
    name: string;
  };
  event: {
    id: string;
    name: string;
    slug: string;
    clientId: string;
  };
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate total discount amount from applied pricing rules.
 * Returns absolute value of sum of negative effects.
 */
function calculateDiscountAmount(appliedRules: PriceBreakdown['appliedRules']): number {
  return Math.abs(
    appliedRules
      .filter((rule) => rule.effect < 0)
      .reduce((sum, rule) => sum + rule.effect, 0)
  );
}

// ============================================================================
// CRUD Operations
// ============================================================================

export async function createRegistration(
  input: CreateRegistrationInput,
  priceBreakdown: PriceBreakdown
): Promise<RegistrationWithRelations> {
  const { formId, formData, email, firstName, lastName, phone, accessSelections, sponsorshipCode } =
    input;

  // Get form and event info (including schemaVersion)
  const form = await prisma.form.findUnique({
    where: { id: formId },
    select: { id: true, eventId: true, schemaVersion: true },
  });
  if (!form) {
    throw new AppError('Form not found', 404, true, ErrorCodes.NOT_FOUND);
  }

  const eventId = form.eventId;

  // Check for duplicate registration
  const existingRegistration = await prisma.registration.findUnique({
    where: { email_eventId: { email, eventId } },
  });
  if (existingRegistration) {
    throw new AppError(
      'A registration with this email already exists for this event',
      409,
      true,
      ErrorCodes.REGISTRATION_ALREADY_EXISTS
    );
  }

  // Validate access selections
  if (accessSelections && accessSelections.length > 0) {
    const validation = await validateAccessSelections(eventId, accessSelections, formData);
    if (!validation.valid) {
      throw new AppError(
        `Invalid access selections: ${validation.errors.join(', ')}`,
        400,
        true,
        ErrorCodes.BAD_REQUEST,
        { errors: validation.errors }
      );
    }
  }

  // Create registration with access selections in a transaction
  return prisma.$transaction(async (tx) => {
    // Create registration
    const registration = await tx.registration.create({
      data: {
        formId,
        eventId,
        formData: formData as Prisma.InputJsonValue,
        formSchemaVersion: form.schemaVersion,
        email,
        firstName: firstName ?? null,
        lastName: lastName ?? null,
        phone: phone ?? null,
        status: 'PENDING',
        paymentStatus: 'PENDING',
        totalAmount: priceBreakdown.total,
        currency: priceBreakdown.currency,
        priceBreakdown: priceBreakdown as unknown as Prisma.InputJsonValue,
        // Denormalized financial columns for reporting
        baseAmount: priceBreakdown.calculatedBasePrice,
        discountAmount: calculateDiscountAmount(priceBreakdown.appliedRules),
        accessAmount: priceBreakdown.accessTotal,
        sponsorshipCode: sponsorshipCode ?? null,
        sponsorshipAmount: priceBreakdown.sponsorshipTotal,
      },
    });

    // Reserve access spots and create selection records
    if (accessSelections && accessSelections.length > 0) {
      for (const selection of accessSelections) {
        // Find matching access item in price breakdown
        const accessItem = priceBreakdown.accessItems.find(
          (item) => item.accessId === selection.accessId
        );
        if (!accessItem) continue;

        // Reserve spot (atomic operation with capacity check)
        await reserveAccessSpot(selection.accessId, selection.quantity);

        // Create registration access record
        await tx.registrationAccess.create({
          data: {
            registrationId: registration.id,
            accessId: selection.accessId,
            unitPrice: accessItem.unitPrice,
            quantity: selection.quantity,
            subtotal: accessItem.subtotal,
          },
        });
      }
    }

    // Increment event registered count
    await incrementRegisteredCount(eventId);

    // Return full registration with relations
    return tx.registration.findUnique({
      where: { id: registration.id },
      include: {
        accessSelections: {
          include: {
            access: {
              select: {
                id: true,
                name: true,
                type: true,
                startsAt: true,
                endsAt: true,
              },
            },
          },
        },
        form: { select: { id: true, name: true } },
        event: { select: { id: true, name: true, slug: true, clientId: true } },
      },
    }) as Promise<RegistrationWithRelations>;
  });
}

export async function getRegistrationById(
  id: string,
  includeNotes: boolean = false
): Promise<RegistrationWithRelations | null> {
  return prisma.registration.findUnique({
    where: { id },
    include: {
      accessSelections: {
        include: {
          access: {
            select: {
              id: true,
              name: true,
              type: true,
              startsAt: true,
              endsAt: true,
            },
          },
        },
      },
      form: { select: { id: true, name: true } },
      event: { select: { id: true, name: true, slug: true, clientId: true } },
      notes: includeNotes
        ? {
            include: { author: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'desc' },
          }
        : false,
    },
  }) as Promise<RegistrationWithRelations | null>;
}

export async function updateRegistration(
  id: string,
  input: UpdateRegistrationInput
): Promise<RegistrationWithRelations> {
  const registration = await prisma.registration.findUnique({ where: { id } });
  if (!registration) {
    throw new AppError('Registration not found', 404, true, ErrorCodes.REGISTRATION_NOT_FOUND);
  }

  const updateData: Prisma.RegistrationUpdateInput = {};

  if (input.status !== undefined) {
    updateData.status = input.status;
    if (input.status === 'CONFIRMED' && !registration.confirmedAt) {
      updateData.confirmedAt = new Date();
    }
    if (input.status === 'CANCELLED' && !registration.cancelledAt) {
      updateData.cancelledAt = new Date();
    }
  }
  if (input.paymentStatus !== undefined) updateData.paymentStatus = input.paymentStatus;
  if (input.paidAmount !== undefined) updateData.paidAmount = input.paidAmount;
  if (input.paymentMethod !== undefined) updateData.paymentMethod = input.paymentMethod;
  if (input.paymentReference !== undefined) updateData.paymentReference = input.paymentReference;
  if (input.paymentProofUrl !== undefined) updateData.paymentProofUrl = input.paymentProofUrl;

  await prisma.registration.update({ where: { id }, data: updateData });

  return getRegistrationById(id) as Promise<RegistrationWithRelations>;
}

export async function confirmPayment(id: string, input: UpdatePaymentInput): Promise<RegistrationWithRelations> {
  const registration = await prisma.registration.findUnique({ where: { id } });
  if (!registration) {
    throw new AppError('Registration not found', 404, true, ErrorCodes.REGISTRATION_NOT_FOUND);
  }

  await prisma.registration.update({
    where: { id },
    data: {
      status: 'CONFIRMED',
      paymentStatus: input.paymentStatus,
      paidAmount: input.paidAmount ?? registration.totalAmount,
      paymentMethod: input.paymentMethod ?? null,
      paymentReference: input.paymentReference ?? null,
      paymentProofUrl: input.paymentProofUrl ?? null,
      confirmedAt: new Date(),
    },
  });

  return getRegistrationById(id) as Promise<RegistrationWithRelations>;
}

export async function cancelRegistration(id: string): Promise<RegistrationWithRelations> {
  const registration = await prisma.registration.findUnique({
    where: { id },
    include: { accessSelections: true },
  });
  if (!registration) {
    throw new AppError('Registration not found', 404, true, ErrorCodes.REGISTRATION_NOT_FOUND);
  }

  if (registration.status === 'CANCELLED') {
    throw new AppError('Registration is already cancelled', 400, true, ErrorCodes.REGISTRATION_CANCELLED);
  }

  return prisma.$transaction(async (tx) => {
    // Release access spots
    for (const selection of registration.accessSelections) {
      await releaseAccessSpot(selection.accessId, selection.quantity);

      // Delete selection record
      await tx.registrationAccess.delete({
        where: { id: selection.id },
      });
    }

    // Decrement event registered count
    await decrementRegisteredCount(registration.eventId);

    // Update registration status
    await tx.registration.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
      },
    });

    return getRegistrationById(id) as Promise<RegistrationWithRelations>;
  });
}

export async function listRegistrations(
  eventId: string,
  query: ListRegistrationsQuery
): Promise<PaginatedResult<RegistrationWithRelations>> {
  const { page, limit, status, paymentStatus, search } = query;

  const where: Prisma.RegistrationWhereInput = { eventId };

  if (status) where.status = status;
  if (paymentStatus) where.paymentStatus = paymentStatus;
  if (search) {
    where.OR = [
      { email: { contains: search, mode: 'insensitive' } },
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
    ];
  }

  const skip = getSkip({ page, limit });

  const [data, total] = await Promise.all([
    prisma.registration.findMany({
      where,
      skip,
      take: limit,
      include: {
        accessSelections: {
          include: {
            access: {
              select: {
                id: true,
                name: true,
                type: true,
                startsAt: true,
                endsAt: true,
              },
            },
          },
        },
        form: { select: { id: true, name: true } },
        event: { select: { id: true, name: true, slug: true, clientId: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.registration.count({ where }),
  ]);

  return paginate(data as RegistrationWithRelations[], total, { page, limit });
}

// ============================================================================
// Notes
// ============================================================================

export async function addRegistrationNote(
  registrationId: string,
  authorId: string,
  input: CreateRegistrationNoteInput
): Promise<RegistrationNote> {
  const registration = await prisma.registration.findUnique({ where: { id: registrationId } });
  if (!registration) {
    throw new AppError('Registration not found', 404, true, ErrorCodes.REGISTRATION_NOT_FOUND);
  }

  return prisma.registrationNote.create({
    data: {
      registrationId,
      authorId,
      content: input.content,
      isInternal: input.isInternal ?? true,
    },
  });
}

export async function listRegistrationNotes(
  registrationId: string
): Promise<Array<RegistrationNote & { author: { id: string; name: string } }>> {
  return prisma.registrationNote.findMany({
    where: { registrationId },
    include: { author: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

// ============================================================================
// Helpers
// ============================================================================

export async function getRegistrationClientId(id: string): Promise<string | null> {
  const registration = await prisma.registration.findUnique({
    where: { id },
    include: { event: { select: { clientId: true } } },
  });
  return registration?.event.clientId ?? null;
}

export async function registrationExists(id: string): Promise<boolean> {
  const count = await prisma.registration.count({ where: { id } });
  return count > 0;
}
