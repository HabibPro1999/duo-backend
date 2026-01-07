import { prisma } from '@/database/client.js';
import { AppError } from '@shared/errors/app-error.js';
import { ErrorCodes } from '@shared/errors/error-codes.js';
import { logger } from '@shared/utils/logger.js';
import { paginate, getSkip, type PaginatedResult } from '@shared/utils/pagination.js';
import { incrementRegisteredCount, decrementRegisteredCount } from '@events';
import {
  validateAccessSelections,
  reserveAccessSpot,
  releaseAccessSpot,
} from '@access';
import { calculatePrice } from '@pricing';
import { queueTriggeredEmail } from '@/modules/email/index.js';
import { validateFormData, type FormSchema } from '@shared/utils/form-data-validator.js';
import type {
  CreateRegistrationInput,
  UpdateRegistrationInput,
  UpdatePaymentInput,
  ListRegistrationsQuery,
  PriceBreakdown,
  PublicEditRegistrationInput,
} from './registrations.schema.js';
import type { Registration, Prisma } from '@prisma/client';

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

/**
 * Enrich a registration with accessSelections derived from priceBreakdown.
 * Fetches access details from EventAccess table and reconstructs the shape
 * that was previously provided by the RegistrationAccess relation.
 */
async function enrichWithAccessSelections(
  registration: Registration & {
    form: { id: string; name: string };
    event: { id: string; name: string; slug: string; clientId: string };
  }
): Promise<RegistrationWithRelations> {
  const priceBreakdown = registration.priceBreakdown as PriceBreakdown;

  // If no access items, return empty array
  if (!priceBreakdown.accessItems || priceBreakdown.accessItems.length === 0) {
    return { ...registration, accessSelections: [] };
  }

  // Fetch access details for display
  const accessIds = priceBreakdown.accessItems.map((item) => item.accessId);
  const accessDetails = await prisma.eventAccess.findMany({
    where: { id: { in: accessIds } },
    select: { id: true, name: true, type: true, startsAt: true, endsAt: true },
  });

  const accessMap = new Map(accessDetails.map((a) => [a.id, a]));

  // Reconstruct accessSelections from priceBreakdown
  const accessSelections = priceBreakdown.accessItems.map((item) => ({
    id: `${registration.id}-${item.accessId}`,
    accessId: item.accessId,
    unitPrice: item.unitPrice,
    quantity: item.quantity,
    subtotal: item.subtotal,
    access: accessMap.get(item.accessId) ?? {
      id: item.accessId,
      name: item.name,
      type: 'OTHER',
      startsAt: null,
      endsAt: null,
    },
  }));

  return { ...registration, accessSelections };
}

/**
 * Enrich multiple registrations with accessSelections in a single batch.
 * More efficient than calling enrichWithAccessSelections for each one.
 */
async function enrichManyWithAccessSelections(
  registrations: Array<
    Registration & {
      form: { id: string; name: string };
      event: { id: string; name: string; slug: string; clientId: string };
    }
  >
): Promise<RegistrationWithRelations[]> {
  // Collect all unique access IDs across all registrations
  const allAccessIds = new Set<string>();
  for (const reg of registrations) {
    const priceBreakdown = reg.priceBreakdown as PriceBreakdown;
    if (priceBreakdown.accessItems) {
      for (const item of priceBreakdown.accessItems) {
        allAccessIds.add(item.accessId);
      }
    }
  }

  // Fetch all access details in one query
  const accessDetails = await prisma.eventAccess.findMany({
    where: { id: { in: Array.from(allAccessIds) } },
    select: { id: true, name: true, type: true, startsAt: true, endsAt: true },
  });

  const accessMap = new Map(accessDetails.map((a) => [a.id, a]));

  // Enrich each registration
  return registrations.map((registration) => {
    const priceBreakdown = registration.priceBreakdown as PriceBreakdown;

    if (!priceBreakdown.accessItems || priceBreakdown.accessItems.length === 0) {
      return { ...registration, accessSelections: [] };
    }

    const accessSelections = priceBreakdown.accessItems.map((item) => ({
      id: `${registration.id}-${item.accessId}`,
      accessId: item.accessId,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      subtotal: item.subtotal,
      access: accessMap.get(item.accessId) ?? {
        id: item.accessId,
        name: item.name,
        type: 'OTHER',
        startsAt: null,
        endsAt: null,
      },
    }));

    return { ...registration, accessSelections };
  });
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
  const result = await prisma.$transaction(async (tx) => {
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
        // Access type IDs for querying
        accessTypeIds: accessSelections?.map((s) => s.accessId) ?? [],
      },
    });

    // Reserve access spots (capacity tracking)
    if (accessSelections && accessSelections.length > 0) {
      for (const selection of accessSelections) {
        await reserveAccessSpot(selection.accessId, selection.quantity);
      }
    }

    // Increment event registered count
    await incrementRegisteredCount(eventId);

    // Return full registration with derived accessSelections
    const createdReg = await tx.registration.findUnique({
      where: { id: registration.id },
      include: {
        form: { select: { id: true, name: true } },
        event: { select: { id: true, name: true, slug: true, clientId: true } },
      },
    });

    if (!createdReg) {
      throw new AppError('Registration creation failed', 500, true, ErrorCodes.INTERNAL_ERROR);
    }

    return enrichWithAccessSelections(createdReg);
  });

  // Queue confirmation email (fire and forget - don't block registration response)
  queueTriggeredEmail('REGISTRATION_CREATED', eventId, {
    id: result.id,
    email,
    firstName,
    lastName,
  }).catch((err) => {
    logger.error({ err, registrationId: result.id }, 'Failed to queue confirmation email');
  });

  return result;
}

export async function getRegistrationById(
  id: string
): Promise<RegistrationWithRelations | null> {
  const registration = await prisma.registration.findUnique({
    where: { id },
    include: {
      form: { select: { id: true, name: true } },
      event: { select: { id: true, name: true, slug: true, clientId: true } },
    },
  });

  if (!registration) return null;

  return enrichWithAccessSelections(registration);
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

  if (input.paymentStatus !== undefined) {
    updateData.paymentStatus = input.paymentStatus;
    // Set paidAt when payment is confirmed
    if ((input.paymentStatus === 'PAID' || input.paymentStatus === 'WAIVED') && !registration.paidAt) {
      updateData.paidAt = new Date();
    }
  }
  if (input.paidAmount !== undefined) updateData.paidAmount = input.paidAmount;
  if (input.paymentMethod !== undefined) updateData.paymentMethod = input.paymentMethod;
  if (input.paymentReference !== undefined) updateData.paymentReference = input.paymentReference;
  if (input.paymentProofUrl !== undefined) updateData.paymentProofUrl = input.paymentProofUrl;
  if (input.note !== undefined) updateData.note = input.note;

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
      paymentStatus: input.paymentStatus,
      paidAmount: input.paidAmount ?? registration.totalAmount,
      paymentMethod: input.paymentMethod ?? null,
      paymentReference: input.paymentReference ?? null,
      paymentProofUrl: input.paymentProofUrl ?? null,
      paidAt: new Date(),
    },
  });

  return getRegistrationById(id) as Promise<RegistrationWithRelations>;
}

/**
 * Delete a registration (only allowed for unpaid registrations).
 * For paid registrations, use refund flow instead.
 */
export async function deleteRegistration(id: string): Promise<void> {
  const registration = await prisma.registration.findUnique({
    where: { id },
    select: {
      id: true,
      eventId: true,
      paymentStatus: true,
      priceBreakdown: true,
    },
  });
  if (!registration) {
    throw new AppError('Registration not found', 404, true, ErrorCodes.REGISTRATION_NOT_FOUND);
  }

  // Only allow deletion of unpaid registrations
  if (registration.paymentStatus === 'PAID') {
    throw new AppError(
      'Cannot delete a paid registration. Use refund instead.',
      400,
      true,
      ErrorCodes.REGISTRATION_DELETE_BLOCKED
    );
  }

  await prisma.$transaction(async (tx) => {
    // Release access spots (get from priceBreakdown)
    const priceBreakdown = registration.priceBreakdown as PriceBreakdown;
    if (priceBreakdown.accessItems) {
      for (const item of priceBreakdown.accessItems) {
        await releaseAccessSpot(item.accessId, item.quantity);
      }
    }

    // Decrement event registered count
    await decrementRegisteredCount(registration.eventId);

    // Delete the registration
    await tx.registration.delete({ where: { id } });
  });
}

export async function listRegistrations(
  eventId: string,
  query: ListRegistrationsQuery
): Promise<PaginatedResult<RegistrationWithRelations>> {
  const { page, limit, paymentStatus, search } = query;

  const where: Prisma.RegistrationWhereInput = { eventId };

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
        form: { select: { id: true, name: true } },
        event: { select: { id: true, name: true, slug: true, clientId: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.registration.count({ where }),
  ]);

  // Enrich with accessSelections derived from priceBreakdown
  const enrichedData = await enrichManyWithAccessSelections(data);

  return paginate(enrichedData, total, { page, limit });
}

// ============================================================================
// Table Columns (for dynamic table rendering)
// ============================================================================

type FieldCondition = {
  fieldId: string;
  operator: string;
  value?: string | number | boolean;
};

type FormField = {
  id: string;
  type: string;
  label?: string;
  options?: Array<{ id: string; label: string; value?: string }>;
  conditions?: FieldCondition[];
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
    mergeWith?: {
      fieldId: string;
      triggerValue: string;
    };
  }>;
  fixedColumns: Array<{
    id: string;
    label: string;
    type: string;
  }>;
};

// ============================================================================
// Smart Merge Helpers
// ============================================================================

const SPECIFY_OTHER_TRIGGER_VALUES = ['other', 'autre', 'other_diet'];

/**
 * Find a "specify other" child field for a given parent field.
 * Returns the child field that:
 * - Has conditions referencing the parent field
 * - Uses 'equals' operator with an "other" value
 */
function findSpecifyOtherChild(
  parentField: FormField,
  allFields: FormField[]
): FormField | null {
  // Only for selection fields
  if (!['dropdown', 'radio'].includes(parentField.type)) return null;

  // Check if parent has an "other" option (by option.id)
  const hasOtherOption = parentField.options?.some((opt) =>
    SPECIFY_OTHER_TRIGGER_VALUES.includes(opt.id.toLowerCase())
  );
  if (!hasOtherOption) return null;

  // Find child field that depends on this parent with equals/other condition
  return (
    allFields.find((child) =>
      child.conditions?.some(
        (cond) =>
          cond.fieldId === parentField.id &&
          cond.operator === 'equals' &&
          SPECIFY_OTHER_TRIGGER_VALUES.includes(String(cond.value ?? '').toLowerCase())
      )
    ) ?? null
  );
}

/**
 * Get default fixed columns when no form exists.
 */
function getDefaultFixedColumns() {
  return [
    { id: 'email', label: 'Email', type: 'email' },
    { id: 'firstName', label: 'First Name', type: 'text' },
    { id: 'lastName', label: 'Last Name', type: 'text' },
    { id: 'phone', label: 'Phone', type: 'phone' },
    { id: 'paymentStatus', label: 'Payment', type: 'payment' },
    { id: 'totalAmount', label: 'Amount', type: 'currency' },
    { id: 'createdAt', label: 'Registered', type: 'datetime' },
  ];
}

/**
 * Get table column definitions for a registration table.
 * Returns dynamic columns from form schema + fixed columns from registration model.
 * Fixed column labels are derived from the form's first step fields.
 * Conditional "specify other" fields are merged with their parent columns.
 */
export async function getRegistrationTableColumns(
  eventId: string
): Promise<RegistrationTableColumns> {
  const form = await prisma.form.findFirst({
    where: { eventId, type: 'REGISTRATION' },
    select: { schema: true },
  });

  if (!form?.schema) {
    return { formColumns: [], fixedColumns: getDefaultFixedColumns() };
  }

  const schema = form.schema as FormSchemaSteps;
  const allFields = schema.steps.flatMap((s) => s.fields);
  const firstStep = schema.steps[0];
  const firstStepFields = firstStep?.fields ?? [];

  // Extract contact field labels from first step by type
  const emailField = firstStepFields.find((f) => f.type === 'email');
  const textFields = firstStepFields.filter((f) => f.type === 'text');
  const phoneField = firstStepFields.find((f) => f.type === 'phone');

  const emailLabel = emailField?.label ?? 'Email';
  const firstNameLabel = textFields[0]?.label ?? 'First Name';
  const lastNameLabel = textFields[1]?.label ?? 'Last Name';
  const phoneLabel = phoneField?.label ?? 'Phone';

  // Track contact field IDs to exclude from formColumns (avoid duplicates)
  const contactFieldIds = new Set<string>(
    [emailField?.id, textFields[0]?.id, textFields[1]?.id, phoneField?.id].filter(
      (id): id is string => Boolean(id)
    )
  );

  // Track which fields should be merged (excluded as standalone columns)
  const mergedChildFieldIds = new Set<string>();

  // First pass: identify all merged child fields
  for (const field of allFields) {
    const specifyOtherChild = findSpecifyOtherChild(field, allFields);
    if (specifyOtherChild) {
      mergedChildFieldIds.add(specifyOtherChild.id);
    }
  }

  // Build form columns with merge metadata
  const formColumns = schema.steps.flatMap((step, stepIndex) =>
    step.fields
      .filter((f) => !['heading', 'paragraph'].includes(f.type))
      .filter((f) => !(stepIndex === 0 && contactFieldIds.has(f.id)))
      .filter((f) => !mergedChildFieldIds.has(f.id)) // Exclude merged children
      .map((field) => {
        const specifyOtherChild = findSpecifyOtherChild(field, allFields);

        if (specifyOtherChild) {
          // Find the trigger value from the child's condition
          const triggerCondition = specifyOtherChild.conditions?.find(
            (c) => c.fieldId === field.id && c.operator === 'equals'
          );

          return {
            id: field.id,
            label: field.label ?? field.id,
            type: field.type,
            options: field.options?.map((opt) => ({ id: opt.id, label: opt.label })),
            mergeWith: {
              fieldId: specifyOtherChild.id,
              triggerValue: String(triggerCondition?.value ?? 'other'),
            },
          };
        }

        return {
          id: field.id,
          label: field.label ?? field.id,
          type: field.type,
          options: field.options?.map((opt) => ({ id: opt.id, label: opt.label })),
        };
      })
  );

  // Fixed columns with labels from form schema
  const fixedColumns = [
    { id: 'email', label: emailLabel, type: 'email' },
    { id: 'firstName', label: firstNameLabel, type: 'text' },
    { id: 'lastName', label: lastNameLabel, type: 'text' },
    { id: 'phone', label: phoneLabel, type: 'phone' },
    { id: 'paymentStatus', label: 'Payment', type: 'payment' },
    { id: 'totalAmount', label: 'Amount', type: 'currency' },
    { id: 'createdAt', label: 'Registered', type: 'datetime' },
  ];

  return { formColumns, fixedColumns };
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
      form: { select: { id: true, name: true, schema: true } },
      event: { select: { id: true, name: true, slug: true, clientId: true, status: true } },
    },
  });

  if (!registration) {
    throw new AppError('Registration not found', 404, true, ErrorCodes.REGISTRATION_NOT_FOUND);
  }

  // Enrich with accessSelections derived from priceBreakdown
  const priceBreakdown = registration.priceBreakdown as PriceBreakdown;
  const accessIds = priceBreakdown.accessItems?.map((item) => item.accessId) ?? [];
  const accessDetails = accessIds.length > 0
    ? await prisma.eventAccess.findMany({
        where: { id: { in: accessIds } },
        select: { id: true, name: true, type: true, startsAt: true, endsAt: true },
      })
    : [];

  const accessMap = new Map(accessDetails.map((a) => [a.id, a]));

  const accessSelections = (priceBreakdown.accessItems ?? []).map((item) => ({
    id: `${registration.id}-${item.accessId}`,
    accessId: item.accessId,
    unitPrice: item.unitPrice,
    quantity: item.quantity,
    subtotal: item.subtotal,
    access: accessMap.get(item.accessId) ?? {
      id: item.accessId,
      name: item.name,
      type: 'OTHER',
      startsAt: null,
      endsAt: null,
    },
  }));

  const enrichedRegistration = { ...registration, accessSelections };

  const restrictions: string[] = [];
  let canEdit = true;
  let canRemoveAccess = true;

  if (registration.paymentStatus === 'REFUNDED') {
    canEdit = false;
    restrictions.push('Registration has been refunded');
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
    registration: enrichedRegistration as RegistrationForEdit,
    canEdit,
    canRemoveAccess,
    editRestrictions: restrictions,
  };
}

export type EditRegistrationPublicResult = {
  registration: RegistrationWithRelations;
  priceBreakdown: PriceBreakdown;
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
  // 1. Get current registration
  const registration = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: {
      form: { select: { id: true, eventId: true, schema: true } },
      event: { select: { id: true, status: true } },
    },
  });

  if (!registration) {
    throw new AppError('Registration not found', 404, true, ErrorCodes.REGISTRATION_NOT_FOUND);
  }

  // 2. Validate registration can be edited
  if (registration.paymentStatus === 'REFUNDED') {
    throw new AppError(
      'Refunded registrations cannot be edited',
      400,
      true,
      ErrorCodes.REGISTRATION_REFUNDED
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

  // 6. Process access selection changes (derive current from priceBreakdown)
  const currentPriceBreakdown = registration.priceBreakdown as PriceBreakdown;
  const currentAccessItems = currentPriceBreakdown.accessItems ?? [];
  const currentAccessIds = new Set(currentAccessItems.map((item) => item.accessId));

  const newAccessSelections = input.accessSelections ??
    currentAccessItems.map((item) => ({ accessId: item.accessId, quantity: item.quantity }));
  const newAccessIds = new Set(newAccessSelections.map((s) => s.accessId));

  const accessToAdd = newAccessSelections.filter((s) => !currentAccessIds.has(s.accessId));
  const accessToRemove = currentAccessItems.filter((item) => !newAccessIds.has(item.accessId));

  // 7. Enforce paid registration rules
  if (isPaid && accessToRemove.length > 0) {
    throw new AppError(
      'Cannot remove access items from a paid registration',
      400,
      true,
      ErrorCodes.REGISTRATION_ACCESS_REMOVAL_BLOCKED,
      {
        message: 'Paid registrations can only add new access items',
        attemptedRemovals: accessToRemove.map((item) => item.accessId),
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

  // 10. Execute transaction
  await prisma.$transaction(async (tx) => {
    // Reserve new access spots
    for (const selection of accessToAdd) {
      await reserveAccessSpot(selection.accessId, selection.quantity);
    }

    // Release removed access spots (only if not paid)
    if (!isPaid) {
      for (const item of accessToRemove) {
        await releaseAccessSpot(item.accessId, item.quantity);
      }
    }

    // Calculate new total
    const newTotalAmount = isPaid ? registration.totalAmount : newPriceBreakdown.total;

    // Update registration
    await tx.registration.update({
      where: { id: registrationId },
      data: {
        formData: newFormData as Prisma.InputJsonValue,
        firstName: input.firstName ?? registration.firstName,
        lastName: input.lastName ?? registration.lastName,
        phone: input.phone ?? registration.phone,
        totalAmount: newTotalAmount,
        priceBreakdown: newPriceBreakdown as unknown as Prisma.InputJsonValue,
        baseAmount: newPriceBreakdown.calculatedBasePrice,
        accessAmount: newPriceBreakdown.accessTotal,
        discountAmount: calculateDiscountAmount(newPriceBreakdown.appliedRules),
        sponsorshipAmount: newPriceBreakdown.sponsorshipTotal,
        accessTypeIds: newAccessSelections.map((s) => s.accessId),
        lastEditedAt: new Date(),
      },
    });
  });

  // Fetch and return updated registration
  const updatedRegistration = await getRegistrationById(registrationId);

  return {
    registration: updatedRegistration!,
    priceBreakdown: newPriceBreakdown,
  };
}
