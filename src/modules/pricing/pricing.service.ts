import { prisma } from '@/database/client.js';
import { AppError } from '@shared/errors/app-error.js';
import { ErrorCodes } from '@shared/errors/error-codes.js';
import { eventExists, getEventById } from '@events';
import type {
  CreatePricingRuleInput,
  UpdatePricingRuleInput,
  CreateEventExtraInput,
  UpdateEventExtraInput,
  CalculatePriceRequest,
  PriceBreakdown,
  PricingCondition,
  SelectedExtra,
} from './pricing.schema.js';
import { Prisma } from '@prisma/client';
import type { PricingRule, EventExtra } from '@prisma/client';

// ============================================================================
// Pricing Rules CRUD
// ============================================================================

/**
 * Create a new pricing rule.
 */
export async function createPricingRule(input: CreatePricingRuleInput): Promise<PricingRule> {
  const { eventId, ...data } = input;

  // Validate that event exists
  const isValidEvent = await eventExists(eventId);
  if (!isValidEvent) {
    throw new AppError('Event not found', 404, true, ErrorCodes.NOT_FOUND);
  }

  return prisma.pricingRule.create({
    data: {
      eventId,
      name: data.name,
      description: data.description ?? Prisma.JsonNull,
      ruleType: data.ruleType,
      priority: data.priority ?? 0,
      conditions: data.conditions as Prisma.InputJsonValue,
      conditionLogic: data.conditionLogic ?? 'AND',
      validFrom: data.validFrom ?? null,
      validTo: data.validTo ?? null,
      priceType: data.priceType ?? 'FIXED',
      priceValue: data.priceValue,
      active: data.active ?? true,
    },
  });
}

/**
 * Update a pricing rule.
 */
export async function updatePricingRule(
  id: string,
  input: UpdatePricingRuleInput
): Promise<PricingRule> {
  const rule = await prisma.pricingRule.findUnique({ where: { id } });
  if (!rule) {
    throw new AppError('Pricing rule not found', 404, true, ErrorCodes.NOT_FOUND);
  }

  const updateData: Prisma.PricingRuleUpdateInput = {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.description !== undefined && {
      description: input.description === null ? Prisma.JsonNull : input.description,
    }),
    ...(input.ruleType !== undefined && { ruleType: input.ruleType }),
    ...(input.priority !== undefined && { priority: input.priority }),
    ...(input.conditions !== undefined && {
      conditions: input.conditions as Prisma.InputJsonValue,
    }),
    ...(input.conditionLogic !== undefined && { conditionLogic: input.conditionLogic }),
    ...(input.validFrom !== undefined && { validFrom: input.validFrom }),
    ...(input.validTo !== undefined && { validTo: input.validTo }),
    ...(input.priceType !== undefined && { priceType: input.priceType }),
    ...(input.priceValue !== undefined && { priceValue: input.priceValue }),
    ...(input.active !== undefined && { active: input.active }),
  };

  return prisma.pricingRule.update({
    where: { id },
    data: updateData,
  });
}

/**
 * Delete a pricing rule.
 */
export async function deletePricingRule(id: string): Promise<void> {
  const rule = await prisma.pricingRule.findUnique({ where: { id } });
  if (!rule) {
    throw new AppError('Pricing rule not found', 404, true, ErrorCodes.NOT_FOUND);
  }

  await prisma.pricingRule.delete({ where: { id } });
}

/**
 * List pricing rules for an event.
 */
export async function listPricingRules(
  eventId: string,
  options?: { active?: boolean }
): Promise<PricingRule[]> {
  const where: { eventId: string; active?: boolean } = { eventId };
  if (options?.active !== undefined) {
    where.active = options.active;
  }

  return prisma.pricingRule.findMany({
    where,
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
  });
}

/**
 * Get a pricing rule by ID.
 */
export async function getPricingRuleById(id: string): Promise<PricingRule | null> {
  return prisma.pricingRule.findUnique({ where: { id } });
}

// ============================================================================
// Event Extras CRUD
// ============================================================================

/**
 * Create a new event extra.
 */
export async function createEventExtra(input: CreateEventExtraInput): Promise<EventExtra> {
  const { eventId, ...data } = input;

  // Validate that event exists
  const isValidEvent = await eventExists(eventId);
  if (!isValidEvent) {
    throw new AppError('Event not found', 404, true, ErrorCodes.NOT_FOUND);
  }

  return prisma.eventExtra.create({
    data: {
      eventId,
      name: data.name as Prisma.InputJsonValue,
      description: data.description ? (data.description as Prisma.InputJsonValue) : Prisma.JsonNull,
      price: data.price,
      currency: data.currency ?? 'MAD',
      maxCapacity: data.maxCapacity ?? null,
      availableFrom: data.availableFrom ?? null,
      availableTo: data.availableTo ?? null,
      conditions: data.conditions ? (data.conditions as Prisma.InputJsonValue) : Prisma.JsonNull,
      conditionLogic: data.conditionLogic ?? 'AND',
      sortOrder: data.sortOrder ?? 0,
      active: data.active ?? true,
    },
  });
}

/**
 * Update an event extra.
 */
export async function updateEventExtra(
  id: string,
  input: UpdateEventExtraInput
): Promise<EventExtra> {
  const extra = await prisma.eventExtra.findUnique({ where: { id } });
  if (!extra) {
    throw new AppError('Event extra not found', 404, true, ErrorCodes.NOT_FOUND);
  }

  const updateData: Prisma.EventExtraUpdateInput = {
    ...(input.name !== undefined && { name: input.name as Prisma.InputJsonValue }),
    ...(input.description !== undefined && {
      description: input.description === null ? Prisma.JsonNull : (input.description as Prisma.InputJsonValue),
    }),
    ...(input.price !== undefined && { price: input.price }),
    ...(input.currency !== undefined && { currency: input.currency }),
    ...(input.maxCapacity !== undefined && { maxCapacity: input.maxCapacity }),
    ...(input.availableFrom !== undefined && { availableFrom: input.availableFrom }),
    ...(input.availableTo !== undefined && { availableTo: input.availableTo }),
    ...(input.conditions !== undefined && {
      conditions: input.conditions === null ? Prisma.JsonNull : (input.conditions as Prisma.InputJsonValue),
    }),
    ...(input.conditionLogic !== undefined && { conditionLogic: input.conditionLogic }),
    ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
    ...(input.active !== undefined && { active: input.active }),
  };

  return prisma.eventExtra.update({
    where: { id },
    data: updateData,
  });
}

/**
 * Delete an event extra.
 */
export async function deleteEventExtra(id: string): Promise<void> {
  const extra = await prisma.eventExtra.findUnique({ where: { id } });
  if (!extra) {
    throw new AppError('Event extra not found', 404, true, ErrorCodes.NOT_FOUND);
  }

  await prisma.eventExtra.delete({ where: { id } });
}

/**
 * List event extras.
 */
export async function listEventExtras(
  eventId: string,
  options?: { active?: boolean }
): Promise<EventExtra[]> {
  const where: { eventId: string; active?: boolean } = { eventId };
  if (options?.active !== undefined) {
    where.active = options.active;
  }

  return prisma.eventExtra.findMany({
    where,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
}

/**
 * Get an event extra by ID.
 */
export async function getEventExtraById(id: string): Promise<EventExtra | null> {
  return prisma.eventExtra.findUnique({ where: { id } });
}

/**
 * Get available extras for an event, filtered by conditions.
 */
export async function getAvailableExtras(
  eventId: string,
  formData: Record<string, unknown>
): Promise<Array<EventExtra & { spotsRemaining: number | null; available: boolean }>> {
  const extras = await prisma.eventExtra.findMany({
    where: { eventId, active: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });

  const now = new Date();

  return extras.map((extra) => {
    // Check date availability
    const dateAvailable =
      (!extra.availableFrom || extra.availableFrom <= now) &&
      (!extra.availableTo || extra.availableTo >= now);

    // Check conditions
    const conditionsMatch = extra.conditions
      ? evaluateConditions(
          extra.conditions as PricingCondition[],
          extra.conditionLogic as 'AND' | 'OR',
          formData
        )
      : true;

    // Check capacity
    const spotsRemaining = extra.maxCapacity
      ? extra.maxCapacity - extra.registeredCount
      : null;
    const capacityAvailable = spotsRemaining === null || spotsRemaining > 0;

    return {
      ...extra,
      spotsRemaining,
      available: dateAvailable && conditionsMatch && capacityAvailable,
    };
  });
}

// ============================================================================
// Price Calculation
// ============================================================================

/**
 * Calculate price breakdown for a form submission.
 */
export async function calculatePrice(
  eventId: string,
  input: CalculatePriceRequest
): Promise<PriceBreakdown> {
  const { formData, selectedExtras, sponsorshipCodes } = input;

  // Get event to verify it exists
  const event = await getEventById(eventId);
  if (!event) {
    throw new AppError('Event not found', 404, true, ErrorCodes.NOT_FOUND);
  }

  // Get form for base price
  const form = await prisma.form.findFirst({
    where: { eventId, active: true },
    orderBy: { createdAt: 'desc' },
  });

  const basePrice = form?.basePrice ?? 0;
  const currency = form?.currency ?? 'MAD';

  // Get pricing rules
  const rules = await listPricingRules(eventId, { active: true });
  const now = new Date();

  const appliedRules: PriceBreakdown['appliedRules'] = [];
  let calculatedBasePrice = basePrice;

  // Find first matching BASE_PRICE rule (highest priority first)
  const basePriceRules = rules
    .filter((r) => r.ruleType === 'BASE_PRICE')
    .filter((r) => isRuleValidForDate(r, now));

  for (const rule of basePriceRules) {
    if (evaluateConditions(rule.conditions as PricingCondition[], rule.conditionLogic as 'AND' | 'OR', formData)) {
      calculatedBasePrice =
        rule.priceType === 'FIXED'
          ? rule.priceValue
          : Math.round(basePrice * (rule.priceValue / 100));

      appliedRules.push({
        ruleId: rule.id,
        ruleName: rule.name,
        effect: calculatedBasePrice - basePrice,
        reason: `Base price set to ${calculatedBasePrice}`,
      });
      break; // Only first matching BASE_PRICE rule applies
    }
  }

  // Apply all matching MODIFIER rules
  const modifierRules = rules
    .filter((r) => r.ruleType === 'MODIFIER')
    .filter((r) => isRuleValidForDate(r, now));

  for (const rule of modifierRules) {
    if (evaluateConditions(rule.conditions as PricingCondition[], rule.conditionLogic as 'AND' | 'OR', formData)) {
      const effect =
        rule.priceType === 'FIXED'
          ? rule.priceValue
          : Math.round(calculatedBasePrice * (rule.priceValue / 100));

      calculatedBasePrice += effect;
      appliedRules.push({
        ruleId: rule.id,
        ruleName: rule.name,
        effect,
      });
    }
  }

  // Calculate extras
  const extrasDetails = await calculateExtrasTotal(selectedExtras, formData);
  const extrasTotal = extrasDetails.reduce((sum, e) => sum + e.subtotal, 0);

  // Validate sponsorship codes (mock for now - TODO: implement real validation)
  const sponsorships = await validateSponsorshipCodes(sponsorshipCodes, eventId);
  const sponsorshipTotal = sponsorships
    .filter((s) => s.valid)
    .reduce((sum, s) => sum + s.amount, 0);

  // Calculate final total
  const subtotal = calculatedBasePrice + extrasTotal;
  const total = Math.max(0, subtotal - sponsorshipTotal);

  return {
    basePrice,
    appliedRules,
    calculatedBasePrice,
    extras: extrasDetails,
    extrasTotal,
    subtotal,
    sponsorships,
    sponsorshipTotal,
    total,
    currency,
  };
}

// ============================================================================
// Capacity Management
// ============================================================================

/**
 * Check if extra has available capacity.
 */
export async function checkExtraCapacity(extraId: string, quantity: number): Promise<boolean> {
  const extra = await prisma.eventExtra.findUnique({ where: { id: extraId } });
  if (!extra) return false;
  if (extra.maxCapacity === null) return true;
  return extra.registeredCount + quantity <= extra.maxCapacity;
}

/**
 * Increment registered count for an extra (atomic).
 */
export async function incrementExtraCount(extraId: string, quantity: number): Promise<EventExtra> {
  return prisma.eventExtra.update({
    where: { id: extraId },
    data: { registeredCount: { increment: quantity } },
  });
}

/**
 * Decrement registered count for an extra (atomic).
 */
export async function decrementExtraCount(extraId: string, quantity: number): Promise<EventExtra> {
  return prisma.eventExtra.update({
    where: { id: extraId },
    data: { registeredCount: { decrement: quantity } },
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a pricing rule is valid for a given date.
 */
function isRuleValidForDate(rule: PricingRule, date: Date): boolean {
  if (rule.validFrom && rule.validFrom > date) return false;
  if (rule.validTo && rule.validTo < date) return false;
  return true;
}

/**
 * Evaluate pricing conditions against form data.
 */
function evaluateConditions(
  conditions: PricingCondition[],
  logic: 'AND' | 'OR',
  formData: Record<string, unknown>
): boolean {
  const results = conditions.map((c) => evaluateSingleCondition(c, formData));
  return logic === 'AND' ? results.every(Boolean) : results.some(Boolean);
}

/**
 * Evaluate a single pricing condition.
 */
function evaluateSingleCondition(
  condition: PricingCondition,
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

/**
 * Calculate extras total from selected extras.
 */
async function calculateExtrasTotal(
  selectedExtras: SelectedExtra[],
  _formData: Record<string, unknown>
): Promise<PriceBreakdown['extras']> {
  if (!selectedExtras.length) return [];

  const extraIds = selectedExtras.map((e) => e.extraId);
  const extras = await prisma.eventExtra.findMany({
    where: { id: { in: extraIds }, active: true },
  });

  const extrasMap = new Map(extras.map((e) => [e.id, e]));

  return selectedExtras
    .map((selected) => {
      const extra = extrasMap.get(selected.extraId);
      if (!extra) return null;

      return {
        extraId: extra.id,
        name: extra.name,
        unitPrice: extra.price,
        quantity: selected.quantity,
        subtotal: extra.price * selected.quantity,
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);
}

/**
 * Validate sponsorship codes (mock implementation - TODO: implement real validation).
 */
async function validateSponsorshipCodes(
  codes: string[],
  _eventId: string
): Promise<PriceBreakdown['sponsorships']> {
  // Mock validation - replace with actual database lookup
  const mockCodes: Record<string, number> = {
    'SPO-A1X7K9': 2000,
    'SPO-B2Y8L0': 1500,
    'FULL-SPONSOR': 5000,
    'STUDENT-50': 500,
  };

  return codes.map((code) => ({
    code,
    amount: mockCodes[code.toUpperCase()] ?? 0,
    valid: code.toUpperCase() in mockCodes,
  }));
}
