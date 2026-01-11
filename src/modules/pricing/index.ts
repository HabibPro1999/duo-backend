// Services
export {
  // Event Pricing
  getEventPricing,
  updateEventPricing,
  // Rule Management Helpers
  addPricingRule,
  updatePricingRule,
  deletePricingRule,
  // Price Calculation
  calculatePrice,
  // Types
  type EventPricingWithRules,
} from './pricing.service.js';

// Schemas & Types
export {
  // Shared
  PricingConditionSchema,
  // Embedded Rules
  EmbeddedPricingRuleSchema,
  CreateEmbeddedRuleSchema,
  UpdateEmbeddedRuleSchema,
  // Event Pricing
  CreateEventPricingSchema,
  UpdateEventPricingSchema,
  EventIdParamSchema,
  RuleIdParamSchema,
  // Price Calculation
  CalculatePriceRequestSchema,
  PriceBreakdownSchema,
  // Types
  type PricingCondition,
  type EmbeddedPricingRule,
  type CreateEmbeddedRuleInput,
  type UpdateEmbeddedRuleInput,
  type CreateEventPricingInput,
  type UpdateEventPricingInput,
  type CalculatePriceRequest,
  type PriceBreakdown,
} from './pricing.schema.js';

// Routes
export { pricingRulesRoutes, pricingPublicRoutes } from './pricing.routes.js';
