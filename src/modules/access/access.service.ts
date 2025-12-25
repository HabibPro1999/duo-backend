import { prisma } from '@/database/client.js';
import { AppError } from '@shared/errors/app-error.js';
import { ErrorCodes } from '@shared/errors/error-codes.js';
import { eventExists } from '@events';
import type {
  CreateEventAccessInput,
  UpdateEventAccessInput,
  AccessSelection,
  GroupedAccessResponse,
  AccessCondition,
} from './access.schema.js';
import { Prisma } from '@prisma/client';
import type { EventAccess } from '@prisma/client';

// ============================================================================
// Types
// ============================================================================

type EventAccessWithPrerequisites = EventAccess & {
  requiredAccess: { id: string; name: string }[];
};

type EnrichedAccess = EventAccess & {
  requiredAccess: { id: string }[];
  spotsRemaining: number | null;
  waitlistSpotsRemaining: number | null;
  isFull: boolean;
  canJoinWaitlist: boolean;
};

// ============================================================================
// CRUD Operations
// ============================================================================

export async function createEventAccess(
  input: CreateEventAccessInput
): Promise<EventAccessWithPrerequisites> {
  const { eventId, requiredAccessIds, ...data } = input;

  // Validate event exists
  if (!(await eventExists(eventId))) {
    throw new AppError('Event not found', 404, true, ErrorCodes.NOT_FOUND);
  }

  // Validate prerequisite access items exist and belong to same event
  if (requiredAccessIds && requiredAccessIds.length > 0) {
    const prerequisites = await prisma.eventAccess.findMany({
      where: { id: { in: requiredAccessIds }, eventId },
    });
    if (prerequisites.length !== requiredAccessIds.length) {
      throw new AppError(
        'One or more prerequisite access items not found or belong to different event',
        400,
        true,
        ErrorCodes.BAD_REQUEST
      );
    }
  }

  return prisma.eventAccess.create({
    data: {
      eventId,
      type: data.type ?? 'OTHER',
      name: data.name,
      description: data.description ?? null,
      location: data.location ?? null,
      startsAt: data.startsAt ?? null,
      endsAt: data.endsAt ?? null,
      price: data.price ?? 0,
      currency: data.currency ?? 'TND',
      maxCapacity: data.maxCapacity ?? null,
      waitlistEnabled: data.waitlistEnabled ?? false,
      maxWaitlist: data.maxWaitlist ?? null,
      availableFrom: data.availableFrom ?? null,
      availableTo: data.availableTo ?? null,
      conditions: data.conditions
        ? (data.conditions as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      conditionLogic: data.conditionLogic ?? 'AND',
      sortOrder: data.sortOrder ?? 0,
      active: data.active ?? true,
      requiredAccess: requiredAccessIds?.length
        ? { connect: requiredAccessIds.map((id) => ({ id })) }
        : undefined,
    },
    include: { requiredAccess: { select: { id: true, name: true } } },
  });
}

export async function updateEventAccess(
  id: string,
  input: UpdateEventAccessInput
): Promise<EventAccessWithPrerequisites> {
  const access = await prisma.eventAccess.findUnique({
    where: { id },
    include: { requiredAccess: true },
  });
  if (!access) {
    throw new AppError('Access item not found', 404, true, ErrorCodes.ACCESS_NOT_FOUND);
  }

  const { requiredAccessIds, ...data } = input;

  // Build update data
  const updateData: Prisma.EventAccessUpdateInput = {};

  if (data.type !== undefined) updateData.type = data.type;
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.location !== undefined) updateData.location = data.location;
  if (data.startsAt !== undefined) updateData.startsAt = data.startsAt;
  if (data.endsAt !== undefined) updateData.endsAt = data.endsAt;
  if (data.price !== undefined) updateData.price = data.price;
  if (data.currency !== undefined) updateData.currency = data.currency;
  if (data.maxCapacity !== undefined) updateData.maxCapacity = data.maxCapacity;
  if (data.waitlistEnabled !== undefined) updateData.waitlistEnabled = data.waitlistEnabled;
  if (data.maxWaitlist !== undefined) updateData.maxWaitlist = data.maxWaitlist;
  if (data.availableFrom !== undefined) updateData.availableFrom = data.availableFrom;
  if (data.availableTo !== undefined) updateData.availableTo = data.availableTo;
  if (data.conditions !== undefined) {
    updateData.conditions =
      data.conditions === null ? Prisma.JsonNull : (data.conditions as Prisma.InputJsonValue);
  }
  if (data.conditionLogic !== undefined) updateData.conditionLogic = data.conditionLogic;
  if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;
  if (data.active !== undefined) updateData.active = data.active;

  // Handle prerequisites update
  if (requiredAccessIds !== undefined) {
    // Validate new prerequisites
    if (requiredAccessIds.length > 0) {
      const prerequisites = await prisma.eventAccess.findMany({
        where: { id: { in: requiredAccessIds }, eventId: access.eventId },
      });
      if (prerequisites.length !== requiredAccessIds.length) {
        throw new AppError(
          'One or more prerequisite access items not found',
          400,
          true,
          ErrorCodes.BAD_REQUEST
        );
      }
      // Prevent circular dependencies
      if (requiredAccessIds.includes(id)) {
        throw new AppError(
          'Access item cannot be its own prerequisite',
          400,
          true,
          ErrorCodes.ACCESS_CIRCULAR_DEPENDENCY
        );
      }
    }

    updateData.requiredAccess = {
      set: requiredAccessIds.map((reqId) => ({ id: reqId })),
    };
  }

  return prisma.eventAccess.update({
    where: { id },
    data: updateData,
    include: { requiredAccess: { select: { id: true, name: true } } },
  });
}

export async function deleteEventAccess(id: string): Promise<void> {
  const access = await prisma.eventAccess.findUnique({ where: { id } });
  if (!access) {
    throw new AppError('Access item not found', 404, true, ErrorCodes.ACCESS_NOT_FOUND);
  }

  // Check if any registrations have selected this access
  const registrationCount = await prisma.registrationAccess.count({
    where: { accessId: id },
  });
  if (registrationCount > 0) {
    throw new AppError(
      'Cannot delete access item with existing registrations',
      409,
      true,
      ErrorCodes.ACCESS_HAS_REGISTRATIONS
    );
  }

  await prisma.eventAccess.delete({ where: { id } });
}

export async function listEventAccess(
  eventId: string,
  options?: { active?: boolean; type?: string }
): Promise<EventAccessWithPrerequisites[]> {
  const where: Prisma.EventAccessWhereInput = { eventId };
  if (options?.active !== undefined) where.active = options.active;
  if (options?.type) where.type = options.type as Prisma.EnumAccessTypeFilter['equals'];

  return prisma.eventAccess.findMany({
    where,
    include: { requiredAccess: { select: { id: true, name: true } } },
    orderBy: [{ sortOrder: 'asc' }, { startsAt: 'asc' }, { createdAt: 'asc' }],
  });
}

export async function getEventAccessById(id: string): Promise<EventAccessWithPrerequisites | null> {
  return prisma.eventAccess.findUnique({
    where: { id },
    include: { requiredAccess: { select: { id: true, name: true } } },
  });
}

export async function getAccessClientId(id: string): Promise<string | null> {
  const access = await prisma.eventAccess.findUnique({
    where: { id },
    include: { event: { select: { clientId: true } } },
  });
  return access?.event.clientId ?? null;
}

// ============================================================================
// Time-Based Grouping (Core Feature)
// ============================================================================

/**
 * Get access items grouped by start time for frontend rendering.
 * Items with the same startsAt are mutually exclusive (radio buttons).
 * Items with different startsAt or no time can be multi-selected (checkboxes).
 */
export async function getGroupedAccess(
  eventId: string,
  formData: Record<string, unknown>,
  selectedAccessIds: string[] = []
): Promise<GroupedAccessResponse> {
  const allAccess = await prisma.eventAccess.findMany({
    where: { eventId, active: true },
    include: { requiredAccess: { select: { id: true } } },
    orderBy: [{ startsAt: 'asc' }, { sortOrder: 'asc' }],
  });

  const now = new Date();

  // Filter by availability, conditions, and prerequisites
  const availableAccess = allAccess.filter((access) => {
    // Check date availability
    if (access.availableFrom && access.availableFrom > now) return false;
    if (access.availableTo && access.availableTo < now) return false;

    // Check form-based conditions
    if (access.conditions) {
      if (
        !evaluateConditions(
          access.conditions as AccessCondition[],
          access.conditionLogic as 'AND' | 'OR',
          formData
        )
      ) {
        return false;
      }
    }

    // Check access-based prerequisites
    if (access.requiredAccess && access.requiredAccess.length > 0) {
      const hasAllPrerequisites = access.requiredAccess.every((req) =>
        selectedAccessIds.includes(req.id)
      );
      if (!hasAllPrerequisites) return false;
    }

    return true;
  });

  // Enrich with availability info
  const enrichedAccess: EnrichedAccess[] = availableAccess.map((access) => {
    const spotsRemaining = access.maxCapacity
      ? access.maxCapacity - access.registeredCount
      : null;
    const waitlistSpotsRemaining = access.maxWaitlist
      ? access.maxWaitlist - access.waitlistCount
      : null;

    return {
      ...access,
      spotsRemaining,
      waitlistSpotsRemaining,
      isFull: spotsRemaining !== null && spotsRemaining <= 0,
      canJoinWaitlist:
        spotsRemaining !== null &&
        spotsRemaining <= 0 &&
        access.waitlistEnabled &&
        (waitlistSpotsRemaining === null || waitlistSpotsRemaining > 0),
    };
  });

  // Group by startsAt time
  const timeGroups = new Map<string, EnrichedAccess[]>();
  const ungrouped: EnrichedAccess[] = [];

  for (const access of enrichedAccess) {
    if (access.startsAt) {
      const timeKey = access.startsAt.toISOString();
      if (!timeGroups.has(timeKey)) {
        timeGroups.set(timeKey, []);
      }
      timeGroups.get(timeKey)!.push(access);
    } else {
      ungrouped.push(access);
    }
  }

  // Convert to response format
  const groups = Array.from(timeGroups.entries()).map(([_timeKey, items]) => ({
    startsAt: items[0].startsAt,
    endsAt: items[0].endsAt,
    selectionType: (items.length > 1 ? 'single' : 'multiple') as 'single' | 'multiple',
    items,
  }));

  return { groups, ungrouped };
}

// ============================================================================
// Capacity Management
// ============================================================================

export async function checkAccessCapacity(
  accessId: string,
  quantity: number = 1
): Promise<{ available: boolean; waitlistAvailable: boolean; spotsRemaining: number | null }> {
  const access = await prisma.eventAccess.findUnique({ where: { id: accessId } });
  if (!access) {
    return { available: false, waitlistAvailable: false, spotsRemaining: null };
  }

  if (access.maxCapacity === null) {
    return { available: true, waitlistAvailable: false, spotsRemaining: null };
  }

  const spotsRemaining = access.maxCapacity - access.registeredCount;
  const available = spotsRemaining >= quantity;

  let waitlistAvailable = false;
  if (!available && access.waitlistEnabled) {
    const waitlistSpotsRemaining = access.maxWaitlist
      ? access.maxWaitlist - access.waitlistCount
      : Infinity;
    waitlistAvailable = waitlistSpotsRemaining >= quantity;
  }

  return { available, waitlistAvailable, spotsRemaining };
}

export async function reserveAccessSpot(
  accessId: string,
  quantity: number = 1,
  allowWaitlist: boolean = false
): Promise<{ status: 'confirmed' | 'waitlisted'; position?: number }> {
  return prisma.$transaction(async (tx) => {
    const access = await tx.eventAccess.findUnique({ where: { id: accessId } });
    if (!access) {
      throw new AppError('Access item not found', 404, true, ErrorCodes.ACCESS_NOT_FOUND);
    }

    // No capacity limit
    if (access.maxCapacity === null) {
      await tx.eventAccess.update({
        where: { id: accessId },
        data: { registeredCount: { increment: quantity } },
      });
      return { status: 'confirmed' as const };
    }

    const spotsRemaining = access.maxCapacity - access.registeredCount;

    // Has capacity
    if (spotsRemaining >= quantity) {
      await tx.eventAccess.update({
        where: { id: accessId },
        data: { registeredCount: { increment: quantity } },
      });
      return { status: 'confirmed' as const };
    }

    // Check waitlist
    if (allowWaitlist && access.waitlistEnabled) {
      const waitlistSpotsRemaining = access.maxWaitlist
        ? access.maxWaitlist - access.waitlistCount
        : Infinity;

      if (waitlistSpotsRemaining >= quantity) {
        const position = access.waitlistCount + 1;
        await tx.eventAccess.update({
          where: { id: accessId },
          data: { waitlistCount: { increment: quantity } },
        });
        return { status: 'waitlisted' as const, position };
      }

      throw new AppError('Waitlist is full', 409, true, ErrorCodes.ACCESS_WAITLIST_FULL);
    }

    throw new AppError('No spots available', 409, true, ErrorCodes.ACCESS_CAPACITY_EXCEEDED);
  });
}

export async function releaseAccessSpot(
  accessId: string,
  quantity: number = 1,
  wasWaitlisted: boolean = false
): Promise<void> {
  await prisma.eventAccess.update({
    where: { id: accessId },
    data: wasWaitlisted
      ? { waitlistCount: { decrement: quantity } }
      : { registeredCount: { decrement: quantity } },
  });
}

export async function promoteFromWaitlist(accessId: string): Promise<string | null> {
  // Find first waitlisted registration for this access
  const waitlistedRegistration = await prisma.registrationAccess.findFirst({
    where: { accessId, status: 'WAITLISTED' },
    orderBy: { waitlistPosition: 'asc' },
    include: { registration: { select: { email: true } } },
  });

  if (!waitlistedRegistration) return null;

  await prisma.$transaction([
    // Update registration access status
    prisma.registrationAccess.update({
      where: { id: waitlistedRegistration.id },
      data: { status: 'PROMOTED', waitlistPosition: null },
    }),
    // Update counts
    prisma.eventAccess.update({
      where: { id: accessId },
      data: {
        registeredCount: { increment: waitlistedRegistration.quantity },
        waitlistCount: { decrement: waitlistedRegistration.quantity },
      },
    }),
  ]);

  return waitlistedRegistration.registration.email;
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate access selections for a registration.
 * Checks: time conflicts, prerequisites, capacity.
 */
export async function validateAccessSelections(
  eventId: string,
  selections: AccessSelection[],
  formData: Record<string, unknown>
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  if (selections.length === 0) {
    return { valid: true, errors: [] };
  }

  const accessIds = selections.map((s) => s.accessId);
  const accessItems = await prisma.eventAccess.findMany({
    where: { id: { in: accessIds }, eventId, active: true },
    include: { requiredAccess: { select: { id: true } } },
  });

  const accessMap = new Map(accessItems.map((a) => [a.id, a]));

  // Check all selected items exist
  for (const selection of selections) {
    if (!accessMap.has(selection.accessId)) {
      errors.push(`Access item ${selection.accessId} not found or inactive`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Check time conflicts (items with same startsAt)
  const timeSlots = new Map<string, string[]>();
  for (const selection of selections) {
    const access = accessMap.get(selection.accessId)!;
    if (access.startsAt) {
      const timeKey = access.startsAt.toISOString();
      if (!timeSlots.has(timeKey)) {
        timeSlots.set(timeKey, []);
      }
      timeSlots.get(timeKey)!.push(selection.accessId);
    }
  }

  for (const items of timeSlots.values()) {
    if (items.length > 1) {
      const names = items.map((id) => {
        const access = accessMap.get(id)!;
        return access.name;
      });
      errors.push(`Time conflict: Can only select one of: ${names.join(', ')}`);
    }
  }

  // Check prerequisites
  for (const selection of selections) {
    const access = accessMap.get(selection.accessId)!;
    if (access.requiredAccess && access.requiredAccess.length > 0) {
      for (const req of access.requiredAccess) {
        if (!accessIds.includes(req.id)) {
          const accessName = access.name;
          errors.push(`${accessName} requires selecting its prerequisite first`);
        }
      }
    }
  }

  // Check form-based conditions
  const now = new Date();
  for (const selection of selections) {
    const access = accessMap.get(selection.accessId)!;

    // Date availability
    if (access.availableFrom && access.availableFrom > now) {
      errors.push(`${access.name} is not yet available`);
    }
    if (access.availableTo && access.availableTo < now) {
      errors.push(`${access.name} is no longer available`);
    }

    // Form conditions
    if (access.conditions) {
      if (
        !evaluateConditions(
          access.conditions as AccessCondition[],
          access.conditionLogic as 'AND' | 'OR',
          formData
        )
      ) {
        errors.push(
          `${access.name} is not available based on your form answers`
        );
      }
    }
  }

  // Check capacity (without reserving)
  for (const selection of selections) {
    const access = accessMap.get(selection.accessId)!;
    if (access.maxCapacity !== null) {
      const spotsRemaining = access.maxCapacity - access.registeredCount;
      if (spotsRemaining < selection.quantity && !access.waitlistEnabled) {
        errors.push(`${access.name} is full`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Helpers
// ============================================================================

function evaluateConditions(
  conditions: AccessCondition[],
  logic: 'AND' | 'OR',
  formData: Record<string, unknown>
): boolean {
  const results = conditions.map((c) => evaluateSingleCondition(c, formData));
  return logic === 'AND' ? results.every(Boolean) : results.some(Boolean);
}

function evaluateSingleCondition(
  condition: AccessCondition,
  formData: Record<string, unknown>
): boolean {
  const value = formData[condition.fieldId];

  switch (condition.operator) {
    case 'equals':
      return value === condition.value;
    case 'not_equals':
      return value !== condition.value;
    case 'contains':
      return typeof value === 'string' && value.includes(String(condition.value));
    case 'greater_than':
      return typeof value === 'number' && value > Number(condition.value);
    case 'less_than':
      return typeof value === 'number' && value < Number(condition.value);
    case 'in':
      return Array.isArray(condition.value) && condition.value.includes(String(value));
    case 'not_in':
      return Array.isArray(condition.value) && !condition.value.includes(String(value));
    default:
      return false;
  }
}
