import { prisma } from '@/database/client.js';
import { AppError } from '@shared/errors/app-error.js';
import { ErrorCodes } from '@shared/errors/error-codes.js';
import { eventExists, getEventById } from '@events';
import type {
  CreatePricingRuleInput,
  UpdatePricingRuleInput,
  CalculatePriceRequest,
  PriceBreakdown,
  PricingCondition,
  SelectedExtra,
} from './pricing.schema.js';
import { Prisma } from '@prisma/client';
import type { PricingRule } from '@prisma/client';

// ============================================================================
// Pricing Rules CRUD
// ============================================================================

/**
 * Create a new pricing rule.
 * A pricing rule defines a conditional base price override:
 * if conditions match → use this price instead of event's base price.
 */
export async function createPricingRule(input: CreatePricingRuleInput): Promise<PricingRule> {
  const { eventId, name, description, priority, conditions, conditionLogic, price, active } = input;

  // Validate that event exists
  const isValidEvent = await eventExists(eventId);
  if (!isValidEvent) {
    throw new AppError('Event not found', 404, true, ErrorCodes.NOT_FOUND);
  }

  return prisma.pricingRule.create({
    data: {
      eventId,
      name,
      description: description ?? null,
      priority: priority ?? 0,
      conditions: conditions as Prisma.InputJsonValue,
      conditionLogic: conditionLogic ?? 'AND',
      price,
      active: active ?? true,
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
    ...(input.description !== undefined && { description: input.description }),
    ...(input.priority !== undefined && { priority: input.priority }),
    ...(input.conditions !== undefined && {
      conditions: input.conditions as Prisma.InputJsonValue,
    }),
    ...(input.conditionLogic !== undefined && { conditionLogic: input.conditionLogic }),
    ...(input.price !== undefined && { price: input.price }),
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
// Price Calculation
// ============================================================================

/**
 * Calculate price breakdown for a registration.
 *
 * Formula:
 *   Base Price = Event.basePrice (or first matching rule's price)
 *   + Selected Access Items
 *   - Sponsorship Discounts
 *   = Total
 */
export async function calculatePrice(
  eventId: string,
  input: CalculatePriceRequest
): Promise<PriceBreakdown> {
  const { formData, selectedExtras, sponsorshipCodes } = input;

  // Get event with base price
  const event = await getEventById(eventId);
  if (!event) {
    throw new AppError('Event not found', 404, true, ErrorCodes.NOT_FOUND);
  }

  const basePrice = event.basePrice;
  const currency = event.currency;

  // Get active pricing rules (sorted by priority desc)
  const rules = await listPricingRules(eventId, { active: true });

  // Find first matching rule (highest priority wins)
  // If a rule matches, its price overrides the base price
  const appliedRules: PriceBreakdown['appliedRules'] = [];
  let calculatedBasePrice = basePrice;

  for (const rule of rules) {
    if (evaluateConditions(rule.conditions as PricingCondition[], rule.conditionLogic as 'AND' | 'OR', formData)) {
      calculatedBasePrice = rule.price;
      appliedRules.push({
        ruleId: rule.id,
        ruleName: rule.name,
        effect: rule.price - basePrice,
        reason: `Base price set to ${rule.price}`,
      });
      break; // First match wins
    }
  }

  // Calculate access/extras total
  const extrasDetails = await calculateExtrasTotal(selectedExtras);
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
// Helper Functions
// ============================================================================

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
 * Calculate extras/access total from selected items.
 */
async function calculateExtrasTotal(
  selectedExtras: SelectedExtra[]
): Promise<PriceBreakdown['extras']> {
  if (!selectedExtras.length) return [];

  const accessIds = selectedExtras.map((e) => e.extraId);
  const accessItems = await prisma.eventAccess.findMany({
    where: { id: { in: accessIds }, active: true },
  });

  const accessMap = new Map(accessItems.map((a) => [a.id, a]));

  return selectedExtras
    .map((selected) => {
      const access = accessMap.get(selected.extraId);
      if (!access) return null;

      return {
        extraId: access.id,
        name: access.name,
        unitPrice: access.price,
        quantity: selected.quantity,
        subtotal: access.price * selected.quantity,
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
