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
  AccessType,
  TimeSlot,
  TypeGroup,
} from './access.schema.js';
import { ACCESS_TYPE_LABELS } from './access.schema.js';
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
  isFull: boolean;
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
      availableFrom: data.availableFrom ?? null,
      availableTo: data.availableTo ?? null,
      conditions: data.conditions
        ? (data.conditions as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      conditionLogic: data.conditionLogic ?? 'AND',
      sortOrder: data.sortOrder ?? 0,
      active: data.active ?? true,
      groupLabel: data.groupLabel ?? null,
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
  if (data.availableFrom !== undefined) updateData.availableFrom = data.availableFrom;
  if (data.availableTo !== undefined) updateData.availableTo = data.availableTo;
  if (data.conditions !== undefined) {
    updateData.conditions =
      data.conditions === null ? Prisma.JsonNull : (data.conditions as Prisma.InputJsonValue);
  }
  if (data.conditionLogic !== undefined) updateData.conditionLogic = data.conditionLogic;
  if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;
  if (data.active !== undefined) updateData.active = data.active;
  if (data.groupLabel !== undefined) updateData.groupLabel = data.groupLabel;

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
  const registrationCount = await prisma.registration.count({
    where: { accessTypeIds: { has: id } },
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
// Hierarchical Grouping (Type → Time Slots)
// ============================================================================

/**
 * Get access items grouped hierarchically: TYPE → TIME SLOTS
 *
 * Structure:
 * - Groups are organized by type (WORKSHOP, DINNER, etc.)
 * - Within each type, items are sub-grouped by time slot (startsAt)
 * - If 2+ items share the same time slot → selectionType: 'single' (radio)
 * - If 1 item in a time slot → selectionType: 'multiple' (checkbox)
 *
 * This allows users to select one item from each parallel time slot
 * (e.g., pick one of 3 workshops at 12:00, AND one of 2 workshops at 14:00)
 */
export async function getGroupedAccess(
  eventId: string,
  formData: Record<string, unknown>,
  selectedAccessIds: string[] = []
): Promise<GroupedAccessResponse> {
  const allAccess = await prisma.eventAccess.findMany({
    where: { eventId, active: true },
    include: { requiredAccess: { select: { id: true } } },
    orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { startsAt: 'asc' }],
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

    return {
      ...access,
      spotsRemaining,
      isFull: spotsRemaining !== null && spotsRemaining <= 0,
    };
  });

  // === Hierarchical grouping ===

  // Step 1: Group by TYPE (and groupLabel for OTHER type)
  const typeMap = new Map<string, EnrichedAccess[]>();

  for (const access of enrichedAccess) {
    // For OTHER type, use groupLabel as key to allow custom groups
    const key =
      access.type === 'OTHER'
        ? `OTHER:${access.groupLabel || ''}`
        : access.type;

    if (!typeMap.has(key)) typeMap.set(key, []);
    typeMap.get(key)!.push(access);
  }

  // Step 2: For each type, sub-group by TIME SLOT
  const groups: TypeGroup[] = Array.from(typeMap.entries()).map(
    ([key, items]) => {
      const type = (key.startsWith('OTHER:') ? 'OTHER' : key) as AccessType;
      const customLabel = key.startsWith('OTHER:') ? key.slice(6) : null;

      // Sub-group by startsAt time
      const slotMap = new Map<string, EnrichedAccess[]>();
      for (const item of items) {
        const timeKey = item.startsAt?.toISOString() || 'no-time';
        if (!slotMap.has(timeKey)) slotMap.set(timeKey, []);
        slotMap.get(timeKey)!.push(item);
      }

      // Convert to slots array
      const slots: TimeSlot[] = Array.from(slotMap.entries())
        .map(([_timeKey, slotItems]) => ({
          startsAt: slotItems[0].startsAt,
          endsAt: slotItems[0].endsAt,
          // 2+ items at same time = single (radio), 1 item = multiple (checkbox)
          selectionType: (slotItems.length > 1 ? 'single' : 'multiple') as
            | 'single'
            | 'multiple',
          items: slotItems.sort((a, b) => a.sortOrder - b.sortOrder),
        }))
        .sort((a, b) => {
          // Sort slots by time (null times at end)
          if (!a.startsAt && !b.startsAt) return 0;
          if (!a.startsAt) return 1;
          if (!b.startsAt) return -1;
          return a.startsAt.getTime() - b.startsAt.getTime();
        });

      return {
        type,
        label: customLabel || ACCESS_TYPE_LABELS[type] || type,
        slots,
      };
    }
  );

  // Sort groups by type order
  const typeOrder: AccessType[] = [
    'SESSION',
    'WORKSHOP',
    'DINNER',
    'NETWORKING',
    'ACCOMMODATION',
    'TRANSPORT',
    'OTHER',
  ];
  groups.sort((a, b) => {
    const orderA = typeOrder.indexOf(a.type);
    const orderB = typeOrder.indexOf(b.type);
    if (orderA !== orderB) return orderA - orderB;
    return a.label.localeCompare(b.label);
  });

  return { groups };
}

// ============================================================================
// Capacity Management
// ============================================================================

export async function checkAccessCapacity(
  accessId: string,
  quantity: number = 1
): Promise<{ available: boolean; spotsRemaining: number | null }> {
  const access = await prisma.eventAccess.findUnique({ where: { id: accessId } });

  if (!access) {
    return { available: false, spotsRemaining: null };
  }

  if (access.maxCapacity === null) {
    return { available: true, spotsRemaining: null }; // Unlimited
  }

  const spotsRemaining = access.maxCapacity - access.registeredCount;
  return { available: spotsRemaining >= quantity, spotsRemaining };
}

/**
 * Reserve access spot with atomic capacity check.
 * Uses updateMany with WHERE clause to prevent race conditions.
 */
export async function reserveAccessSpot(
  accessId: string,
  quantity: number = 1
): Promise<void> {
  return prisma.$transaction(async (tx) => {
    const access = await tx.eventAccess.findUnique({ where: { id: accessId } });

    if (!access) {
      throw new AppError('Access not found', 404, true, ErrorCodes.ACCESS_NOT_FOUND);
    }

    // No capacity limit - just increment
    if (access.maxCapacity === null) {
      await tx.eventAccess.update({
        where: { id: accessId },
        data: { registeredCount: { increment: quantity } },
      });
      return;
    }

    // Atomic update with capacity check
    // This only succeeds if registeredCount + quantity <= maxCapacity
    const updateResult = await tx.eventAccess.updateMany({
      where: {
        id: accessId,
        registeredCount: { lte: access.maxCapacity - quantity },
      },
      data: { registeredCount: { increment: quantity } },
    });

    if (updateResult.count === 0) {
      throw new AppError('No spots available', 409, true, ErrorCodes.ACCESS_CAPACITY_EXCEEDED);
    }
  });
}

/**
 * Release access spot with floor constraint to prevent negative counts.
 */
export async function releaseAccessSpot(
  accessId: string,
  quantity: number = 1
): Promise<void> {
  await prisma.eventAccess.updateMany({
    where: {
      id: accessId,
      registeredCount: { gte: quantity },
    },
    data: { registeredCount: { decrement: quantity } },
  });
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

  // Check time conflicts WITHIN EACH TYPE (items with same startsAt in same type)
  // Group selections by type first, then check time slots within each type
  const selectionsByType = new Map<
    string,
    { access: EventAccess; selection: AccessSelection }[]
  >();

  for (const selection of selections) {
    const access = accessMap.get(selection.accessId)!;
    // For OTHER type, use groupLabel as key to allow custom groups
    const typeKey =
      access.type === 'OTHER'
        ? `OTHER:${access.groupLabel || ''}`
        : access.type;

    if (!selectionsByType.has(typeKey)) selectionsByType.set(typeKey, []);
    selectionsByType.get(typeKey)!.push({ access, selection });
  }

  // For each type group, check if multiple selections have same startsAt
  for (const typeItems of selectionsByType.values()) {
    // Group by time slot within this type
    const byTimeSlot = new Map<string, string[]>();

    for (const { access } of typeItems) {
      if (access.startsAt) {
        const timeKey = access.startsAt.toISOString();
        if (!byTimeSlot.has(timeKey)) byTimeSlot.set(timeKey, []);
        byTimeSlot.get(timeKey)!.push(access.name);
      }
    }

    // Check for conflicts (2+ selections in same time slot)
    for (const names of byTimeSlot.values()) {
      if (names.length > 1) {
        errors.push(`Time conflict: Cannot select both "${names.join('" and "')}"`);
      }
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
      if (spotsRemaining < selection.quantity) {
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
    default:
      return false;
  }
}
