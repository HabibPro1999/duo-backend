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
import { calculatePrice } from '@pricing';
import { validateFormData, type FormSchema } from '@shared/utils/form-data-validator.js';
import { randomUUID } from 'crypto';
import type {
  CreateRegistrationInput,
  UpdateRegistrationInput,
  UpdatePaymentInput,
  CreateRegistrationNoteInput,
  ListRegistrationsQuery,
  PriceBreakdown,
  PublicEditRegistrationInput,
  AmendmentRecord,
  FormDataChange,
  AccessChange,
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
// Table Columns (for dynamic table rendering)
// ============================================================================

type FormField = {
  id: string;
  type: string;
  label?: string;
  options?: Array<{ id: string; label: string }>;
};

type FormSchemaSteps = {
  steps: Array<{ fields: FormField[] }>;
};

export type RegistrationTableColumns = {
  formColumns: Array<{
    id: string;
    label: string;
    type: string;
    options?: Array<{ id: string; label: string }>;
  }>;
  fixedColumns: Array<{
    id: string;
    label: string;
    type: string;
  }>;
};

/**
 * Get table column definitions for a registration table.
 * Returns dynamic columns from form schema + fixed columns from registration model.
 */
export async function getRegistrationTableColumns(
  eventId: string
): Promise<RegistrationTableColumns> {
  const form = await prisma.form.findUnique({
    where: { eventId },
    select: { schema: true },
  });

  if (!form) {
    throw new AppError('Form not found for this event', 404, true, ErrorCodes.NOT_FOUND);
  }

  const schema = form.schema as FormSchemaSteps;

  // Extract form fields, skip display-only types (heading, paragraph)
  const formColumns = schema.steps.flatMap((step) =>
    step.fields
      .filter((f) => !['heading', 'paragraph'].includes(f.type))
      .map((field) => ({
        id: field.id,
        label: field.label ?? field.id,
        type: field.type,
        options: field.options?.map((opt) => ({
          id: opt.id,
          label: opt.label,
        })),
      }))
  );

  // Fixed columns from registration model (always present)
  const fixedColumns = [
    { id: 'email', label: 'Email', type: 'email' },
    { id: 'firstName', label: 'First Name', type: 'text' },
    { id: 'lastName', label: 'Last Name', type: 'text' },
    { id: 'phone', label: 'Phone', type: 'phone' },
    { id: 'status', label: 'Status', type: 'status' },
    { id: 'paymentStatus', label: 'Payment', type: 'payment' },
    { id: 'totalAmount', label: 'Amount', type: 'currency' },
    { id: 'createdAt', label: 'Registered', type: 'datetime' },
  ];

  return { formColumns, fixedColumns };
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

// ============================================================================
// Public Self-Service Editing
// ============================================================================

type RegistrationForEdit = RegistrationWithRelations & {
  form: {
    id: string;
    name: string;
    schema: unknown;
  };
  event: {
    id: string;
    name: string;
    slug: string;
    clientId: string;
    status: string;
  };
};

export type GetRegistrationForEditResult = {
  registration: RegistrationForEdit;
  canEdit: boolean;
  canRemoveAccess: boolean;
  editRestrictions: string[];
};

/**
 * Get registration for public self-service editing.
 * Returns registration data with edit permissions info.
 */
export async function getRegistrationForEdit(
  registrationId: string
): Promise<GetRegistrationForEditResult> {
  const registration = await prisma.registration.findUnique({
    where: { id: registrationId },
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
      form: { select: { id: true, name: true, schema: true } },
      event: { select: { id: true, name: true, slug: true, clientId: true, status: true } },
    },
  });

  if (!registration) {
    throw new AppError('Registration not found', 404, true, ErrorCodes.REGISTRATION_NOT_FOUND);
  }

  const restrictions: string[] = [];
  let canEdit = true;
  let canRemoveAccess = true;

  if (registration.status === 'CANCELLED') {
    canEdit = false;
    restrictions.push('Registration has been cancelled');
  }

  if (registration.event.status !== 'OPEN') {
    canEdit = false;
    restrictions.push('Event is not accepting changes');
  }

  const isPaid = registration.paymentStatus === 'PAID' || registration.paidAmount > 0;
  if (isPaid) {
    canRemoveAccess = false;
    restrictions.push('Cannot remove access items (payment received)');
  }

  return {
    registration: registration as RegistrationForEdit,
    canEdit,
    canRemoveAccess,
    editRestrictions: restrictions,
  };
}

/**
 * Build amendment record for tracking registration changes.
 */
function buildAmendmentRecord(
  registration: Registration & { accessSelections: Array<{ accessId: string; quantity: number; subtotal: number; access: { name: string } }> },
  input: PublicEditRegistrationInput,
  currentFormData: Record<string, unknown>,
  accessToAdd: Array<{ accessId: string; quantity: number }>,
  accessToRemove: Array<{ accessId: string; quantity: number; subtotal: number; access: { name: string } }>,
  newPriceBreakdown: PriceBreakdown,
  isPaid: boolean
): AmendmentRecord {
  // Detect form data changes
  const formDataChanges: FormDataChange[] = [];
  if (input.formData) {
    for (const [fieldId, newValue] of Object.entries(input.formData)) {
      const oldValue = currentFormData[fieldId];
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        formDataChanges.push({ fieldId, oldValue, newValue });
      }
    }
  }

  // Build access changes
  const accessChanges: AccessChange[] = [];

  for (const selection of accessToAdd) {
    const accessItem = newPriceBreakdown.accessItems.find(
      (i) => i.accessId === selection.accessId
    );
    accessChanges.push({
      type: 'added',
      accessId: selection.accessId,
      accessName: typeof accessItem?.name === 'string' ? accessItem.name : 'Unknown',
      quantity: selection.quantity,
      priceImpact: accessItem?.subtotal ?? 0,
    });
  }

  for (const selection of accessToRemove) {
    accessChanges.push({
      type: 'removed',
      accessId: selection.accessId,
      accessName: selection.access.name,
      quantity: selection.quantity,
      priceImpact: -selection.subtotal,
    });
  }

  // Determine change type
  let changeType: AmendmentRecord['changeType'] = 'form_data';
  const hasFormChanges = formDataChanges.length > 0;
  const hasAdditions = accessChanges.some((c) => c.type === 'added');
  const hasRemovals = accessChanges.some((c) => c.type === 'removed');

  if (hasFormChanges && accessChanges.length > 0) {
    changeType = 'mixed';
  } else if (hasAdditions && hasRemovals) {
    changeType = 'mixed';
  } else if (hasAdditions) {
    changeType = 'access_added';
  } else if (hasRemovals) {
    changeType = 'access_removed';
  }

  const previousAdditionalDue = registration.additionalAmountDue ?? 0;
  const newAdditionalDue = isPaid
    ? Math.max(0, newPriceBreakdown.total - registration.totalAmount)
    : 0;

  return {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    changeType,
    formDataChanges: formDataChanges.length > 0 ? formDataChanges : undefined,
    accessChanges: accessChanges.length > 0 ? accessChanges : undefined,
    previousTotal: registration.totalAmount,
    newTotal: newPriceBreakdown.total,
    previousAdditionalDue,
    newAdditionalDue,
    priceBreakdownSnapshot: newPriceBreakdown,
  };
}

export type EditRegistrationPublicResult = {
  registration: RegistrationWithRelations;
  priceBreakdown: PriceBreakdown;
  amendment: AmendmentRecord;
  additionalAmountDue: number;
};

/**
 * Edit registration (self-service, public endpoint).
 *
 * Rules:
 * - CANCELLED registrations cannot be edited
 * - Form data can always be edited
 * - If NOT paid: Can add/remove access items, recalculate totalAmount
 * - If PAID: Can only ADD access items, track additionalAmountDue
 */
export async function editRegistrationPublic(
  registrationId: string,
  input: PublicEditRegistrationInput
): Promise<EditRegistrationPublicResult> {
  // 1. Get current registration with relations
  const registration = await prisma.registration.findUnique({
    where: { id: registrationId },
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
      form: { select: { id: true, eventId: true, schema: true } },
      event: { select: { id: true, status: true } },
    },
  });

  if (!registration) {
    throw new AppError('Registration not found', 404, true, ErrorCodes.REGISTRATION_NOT_FOUND);
  }

  // 2. Validate registration can be edited
  if (registration.status === 'CANCELLED') {
    throw new AppError(
      'Cancelled registrations cannot be edited',
      400,
      true,
      ErrorCodes.REGISTRATION_CANCELLED
    );
  }

  if (registration.event.status !== 'OPEN') {
    throw new AppError(
      'Event is not accepting changes',
      400,
      true,
      ErrorCodes.REGISTRATION_EDIT_FORBIDDEN
    );
  }

  // 3. Determine if paid (affects what can be changed)
  const isPaid = registration.paymentStatus === 'PAID' || registration.paidAmount > 0;

  // 4. Prepare form data changes
  const currentFormData = registration.formData as Record<string, unknown>;
  const newFormData = input.formData
    ? { ...currentFormData, ...input.formData }
    : currentFormData;

  // 5. Validate new form data against form schema
  if (input.formData) {
    const validationResult = validateFormData(
      registration.form.schema as unknown as FormSchema,
      newFormData
    );
    if (!validationResult.valid) {
      throw new AppError(
        'Form validation failed',
        400,
        true,
        ErrorCodes.FORM_VALIDATION_ERROR,
        { fieldErrors: validationResult.errors }
      );
    }
  }

  // 6. Process access selection changes
  const currentAccessIds = new Set(registration.accessSelections.map((s) => s.accessId));
  const newAccessSelections = input.accessSelections ??
    registration.accessSelections.map((s) => ({ accessId: s.accessId, quantity: s.quantity }));
  const newAccessIds = new Set(newAccessSelections.map((s) => s.accessId));

  const accessToAdd = newAccessSelections.filter((s) => !currentAccessIds.has(s.accessId));
  const accessToRemove = registration.accessSelections.filter((s) => !newAccessIds.has(s.accessId));

  // 7. Enforce paid registration rules
  if (isPaid && accessToRemove.length > 0) {
    throw new AppError(
      'Cannot remove access items from a paid registration',
      400,
      true,
      ErrorCodes.REGISTRATION_ACCESS_REMOVAL_BLOCKED,
      {
        message: 'Paid registrations can only add new access items',
        attemptedRemovals: accessToRemove.map((s) => s.accessId),
      }
    );
  }

  // 8. Validate new access selections if there are additions
  if (accessToAdd.length > 0) {
    const validation = await validateAccessSelections(
      registration.eventId,
      newAccessSelections,
      newFormData
    );
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

  // 9. Calculate new price breakdown
  const selectedExtras = newAccessSelections.map((s) => ({
    extraId: s.accessId,
    quantity: s.quantity,
  }));

  const calculatedPrice = await calculatePrice(registration.eventId, {
    formData: newFormData,
    selectedExtras,
    sponsorshipCodes: registration.sponsorshipCode ? [registration.sponsorshipCode] : [],
  });

  // Transform to registration format
  const newPriceBreakdown: PriceBreakdown = {
    basePrice: calculatedPrice.basePrice,
    appliedRules: calculatedPrice.appliedRules,
    calculatedBasePrice: calculatedPrice.calculatedBasePrice,
    accessItems: calculatedPrice.extras.map((extra) => ({
      accessId: extra.extraId,
      name: extra.name,
      unitPrice: extra.unitPrice,
      quantity: extra.quantity,
      subtotal: extra.subtotal,
    })),
    accessTotal: calculatedPrice.extrasTotal,
    subtotal: calculatedPrice.subtotal,
    sponsorships: calculatedPrice.sponsorships,
    sponsorshipTotal: calculatedPrice.sponsorshipTotal,
    total: calculatedPrice.total,
    currency: calculatedPrice.currency,
  };

  // 10. Build amendment record
  const amendment = buildAmendmentRecord(
    registration,
    input,
    currentFormData,
    accessToAdd,
    accessToRemove,
    newPriceBreakdown,
    isPaid
  );

  // 11. Execute transaction
  await prisma.$transaction(async (tx) => {
    // Reserve new access spots
    for (const selection of accessToAdd) {
      await reserveAccessSpot(selection.accessId, selection.quantity);

      // Create registration access record
      const accessItem = newPriceBreakdown.accessItems.find(
        (item) => item.accessId === selection.accessId
      );
      if (accessItem) {
        await tx.registrationAccess.create({
          data: {
            registrationId,
            accessId: selection.accessId,
            unitPrice: accessItem.unitPrice,
            quantity: selection.quantity,
            subtotal: accessItem.subtotal,
          },
        });
      }
    }

    // Release removed access spots (only if not paid)
    if (!isPaid) {
      for (const selection of accessToRemove) {
        await releaseAccessSpot(selection.accessId, selection.quantity);
        await tx.registrationAccess.deleteMany({
          where: {
            registrationId,
            accessId: selection.accessId,
          },
        });
      }
    }

    // Calculate financial updates
    const currentAmendmentHistory = (registration.amendmentHistory || []) as AmendmentRecord[];
    const newAmendmentHistory = [...currentAmendmentHistory, amendment];

    let newTotalAmount: number;
    let newAdditionalAmountDue: number;

    if (isPaid) {
      // Paid: Keep original total, track additional as additionalAmountDue
      newTotalAmount = registration.totalAmount;
      newAdditionalAmountDue = Math.max(0, newPriceBreakdown.total - registration.totalAmount);
    } else {
      // Unpaid: Update total directly
      newTotalAmount = newPriceBreakdown.total;
      newAdditionalAmountDue = 0;
    }

    // Update registration
    await tx.registration.update({
      where: { id: registrationId },
      data: {
        formData: newFormData as Prisma.InputJsonValue,
        firstName: input.firstName ?? registration.firstName,
        lastName: input.lastName ?? registration.lastName,
        phone: input.phone ?? registration.phone,
        totalAmount: newTotalAmount,
        additionalAmountDue: newAdditionalAmountDue,
        priceBreakdown: newPriceBreakdown as unknown as Prisma.InputJsonValue,
        baseAmount: newPriceBreakdown.calculatedBasePrice,
        accessAmount: newPriceBreakdown.accessTotal,
        discountAmount: calculateDiscountAmount(newPriceBreakdown.appliedRules),
        lastEditedAt: new Date(),
        editCount: { increment: 1 },
        amendmentHistory: newAmendmentHistory as unknown as Prisma.InputJsonValue,
      },
    });
  });

  // Fetch and return updated registration
  const updatedRegistration = await getRegistrationById(registrationId);

  return {
    registration: updatedRegistration!,
    priceBreakdown: newPriceBreakdown,
    amendment,
    additionalAmountDue: isPaid ? Math.max(0, newPriceBreakdown.total - registration.totalAmount) : 0,
  };
}
