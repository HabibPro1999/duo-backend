import { randomUUID } from 'crypto';
import { prisma } from '@/database/client.js';
import { AppError } from '@shared/errors/app-error.js';
import { ErrorCodes } from '@shared/errors/error-codes.js';
import { eventExists } from '@events';
import type {
  CreateEventPricingInput,
  UpdateEventPricingInput,
  CreateEmbeddedRuleInput,
  UpdateEmbeddedRuleInput,
  EmbeddedPricingRule,
  CalculatePriceRequest,
  PriceBreakdown,
  PricingCondition,
  SelectedExtra,
} from './pricing.schema.js';
import type { Prisma, EventPricing } from '@prisma/client';

// ============================================================================
// Types
// ============================================================================

// EventPricing with parsed rules array
export type EventPricingWithRules = Omit<EventPricing, 'rules'> & {
  rules: EmbeddedPricingRule[];
};

// ============================================================================
// Event Pricing CRUD (Unified with embedded rules)
// ============================================================================

/**
 * Create event pricing configuration with optional embedded rules.
 * Called automatically when Event is created.
 */
export async function createEventPricing(
  input: CreateEventPricingInput
): Promise<EventPricingWithRules> {
  const { eventId, basePrice, currency, rules } = input;

  // Validate event exists
  const isValidEvent = await eventExists(eventId);
  if (!isValidEvent) {
    throw new AppError('Event not found', 404, true, ErrorCodes.NOT_FOUND);
  }

  // Check if pricing already exists
  const existing = await prisma.eventPricing.findUnique({ where: { eventId } });
  if (existing) {
    throw new AppError(
      'Event pricing already exists',
      409,
      true,
      ErrorCodes.CONFLICT
    );
  }

  // Generate IDs for any rules
  const rulesWithIds = (rules ?? []).map((rule) => ({
    ...rule,
    id: randomUUID(),
  }));

  const pricing = await prisma.eventPricing.create({
    data: {
      eventId,
      basePrice: basePrice ?? 0,
      currency: currency ?? 'TND',
      rules: rulesWithIds as Prisma.InputJsonValue,
    },
  });

  return {
    ...pricing,
    rules: (pricing.rules as unknown as EmbeddedPricingRule[]) ?? [],
  };
}

/**
 * Get event pricing by event ID with parsed rules.
 */
export async function getEventPricing(
  eventId: string
): Promise<EventPricingWithRules | null> {
  const pricing = await prisma.eventPricing.findUnique({ where: { eventId } });
  if (!pricing) return null;

  return {
    ...pricing,
    rules: (pricing.rules as unknown as EmbeddedPricingRule[]) ?? [],
  };
}

/**
 * Update event pricing (base price, currency, and/or rules).
 */
export async function updateEventPricing(
  eventId: string,
  input: UpdateEventPricingInput
): Promise<EventPricingWithRules> {
  const pricing = await prisma.eventPricing.findUnique({ where: { eventId } });
  if (!pricing) {
    throw new AppError(
      'Event pricing not found',
      404,
      true,
      ErrorCodes.PRICING_NOT_FOUND
    );
  }

  const updateData: Prisma.EventPricingUpdateInput = {};

  if (input.basePrice !== undefined) updateData.basePrice = input.basePrice;
  if (input.currency !== undefined) updateData.currency = input.currency;
  if (input.rules !== undefined) {
    // Ensure all rules have IDs (in case new ones are added)
    const rulesWithIds = input.rules.map((rule) => ({
      ...rule,
      id: rule.id ?? randomUUID(),
    }));
    updateData.rules = rulesWithIds as Prisma.InputJsonValue;
  }

  const updated = await prisma.eventPricing.update({
    where: { eventId },
    data: updateData,
  });

  return {
    ...updated,
    rules: (updated.rules as unknown as EmbeddedPricingRule[]) ?? [],
  };
}

/**
 * Delete event pricing (usually cascades with Event deletion).
 */
export async function deleteEventPricing(eventId: string): Promise<void> {
  const pricing = await prisma.eventPricing.findUnique({ where: { eventId } });
  if (!pricing) {
    throw new AppError(
      'Event pricing not found',
      404,
      true,
      ErrorCodes.PRICING_NOT_FOUND
    );
  }

  await prisma.eventPricing.delete({ where: { eventId } });
}

// ============================================================================
// Embedded Rule Management Helpers
// ============================================================================

/**
 * Add a single pricing rule to an event's pricing.
 */
export async function addPricingRule(
  eventId: string,
  rule: CreateEmbeddedRuleInput
): Promise<EventPricingWithRules> {
  const pricing = await getEventPricing(eventId);
  if (!pricing) {
    throw new AppError(
      'Event pricing not found',
      404,
      true,
      ErrorCodes.PRICING_NOT_FOUND
    );
  }

  const newRule: EmbeddedPricingRule = {
    ...rule,
    id: randomUUID(),
    description: rule.description ?? null,
    priority: rule.priority ?? 0,
    conditionLogic: rule.conditionLogic ?? 'AND',
    active: rule.active ?? true,
  };

  const updatedRules = [...pricing.rules, newRule];
  return updateEventPricing(eventId, { rules: updatedRules });
}

/**
 * Update a single pricing rule by ID.
 */
export async function updatePricingRule(
  eventId: string,
  ruleId: string,
  updates: UpdateEmbeddedRuleInput
): Promise<EventPricingWithRules> {
  const pricing = await getEventPricing(eventId);
  if (!pricing) {
    throw new AppError(
      'Event pricing not found',
      404,
      true,
      ErrorCodes.PRICING_NOT_FOUND
    );
  }

  const ruleIndex = pricing.rules.findIndex((r) => r.id === ruleId);
  if (ruleIndex === -1) {
    throw new AppError('Pricing rule not found', 404, true, ErrorCodes.NOT_FOUND);
  }

  const updatedRules = [...pricing.rules];
  updatedRules[ruleIndex] = { ...updatedRules[ruleIndex], ...updates };

  return updateEventPricing(eventId, { rules: updatedRules });
}

/**
 * Delete a single pricing rule by ID.
 */
export async function deletePricingRule(
  eventId: string,
  ruleId: string
): Promise<EventPricingWithRules> {
  const pricing = await getEventPricing(eventId);
  if (!pricing) {
    throw new AppError(
      'Event pricing not found',
      404,
      true,
      ErrorCodes.PRICING_NOT_FOUND
    );
  }

  const ruleExists = pricing.rules.some((r) => r.id === ruleId);
  if (!ruleExists) {
    throw new AppError('Pricing rule not found', 404, true, ErrorCodes.NOT_FOUND);
  }

  const updatedRules = pricing.rules.filter((r) => r.id !== ruleId);
  return updateEventPricing(eventId, { rules: updatedRules });
}

// ============================================================================
// Price Calculation
// ============================================================================

/**
 * Calculate price breakdown for a registration.
 *
 * Formula:
 *   Base Price = EventPricing.basePrice (or first matching rule's price)
 *   + Selected Access Items
 *   - Sponsorship Discounts
 *   = Total
 */
export async function calculatePrice(
  eventId: string,
  input: CalculatePriceRequest
): Promise<PriceBreakdown> {
  const { formData, selectedExtras, sponsorshipCodes } = input;

  // Get event pricing configuration with embedded rules
  const pricing = await getEventPricing(eventId);
  if (!pricing) {
    throw new AppError(
      'Event pricing not found',
      404,
      true,
      ErrorCodes.PRICING_NOT_FOUND
    );
  }

  const { basePrice, currency, rules } = pricing;

  // Get active rules sorted by priority (highest first)
  const activeRules = rules
    .filter((r) => r.active)
    .sort((a, b) => b.priority - a.priority);

  // Find first matching rule (highest priority wins)
  // If a rule matches, its price overrides the base price
  const appliedRules: PriceBreakdown['appliedRules'] = [];
  let calculatedBasePrice = basePrice;

  for (const rule of activeRules) {
    if (evaluateConditions(rule.conditions, rule.conditionLogic, formData)) {
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
      return (
        typeof value === 'string' && value.includes(String(condition.value))
      );
    case 'greater_than':
      return typeof value === 'number' && value > Number(condition.value);
    case 'less_than':
      return typeof value === 'number' && value < Number(condition.value);
    case 'in':
      return (
        Array.isArray(condition.value) &&
        condition.value.includes(String(value))
      );
    case 'not_in':
      return (
        Array.isArray(condition.value) &&
        !condition.value.includes(String(value))
      );
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
