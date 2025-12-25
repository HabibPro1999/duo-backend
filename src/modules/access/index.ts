// ============================================================================
// Access Module - Barrel Export
// ============================================================================

// Service functions
export {
  createEventAccess,
  updateEventAccess,
  deleteEventAccess,
  listEventAccess,
  getEventAccessById,
  getAccessClientId,
  getGroupedAccess,
  validateAccessSelections,
  checkAccessCapacity,
  reserveAccessSpot,
  releaseAccessSpot,
  promoteFromWaitlist,
} from './access.service.js';

// Schemas
export {
  AccessConditionSchema,
  AccessTypeSchema,
  CreateEventAccessSchema,
  UpdateEventAccessSchema,
  ListEventAccessQuerySchema,
  EventAccessIdParamSchema,
  EventIdParamSchema,
  AccessGroupSchema,
  GroupedAccessResponseSchema,
  AccessSelectionSchema,
  GetGroupedAccessBodySchema,
  ValidateAccessSelectionsBodySchema,
} from './access.schema.js';

// Types
export type {
  AccessType,
  AccessCondition,
  CreateEventAccessInput,
  UpdateEventAccessInput,
  AccessSelection,
  AccessGroup,
  GroupedAccessResponse,
  GetGroupedAccessBody,
  ValidateAccessSelectionsBody,
} from './access.schema.js';

// Routes
export { accessRoutes } from './access.routes.js';
export { accessPublicRoutes } from './access.public.routes.js';
