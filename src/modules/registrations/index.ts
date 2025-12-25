// ============================================================================
// Registrations Module - Barrel Export
// ============================================================================

// Service functions
export {
  createRegistration,
  getRegistrationById,
  updateRegistration,
  confirmPayment,
  cancelRegistration,
  listRegistrations,
  addRegistrationNote,
  listRegistrationNotes,
  getRegistrationClientId,
  registrationExists,
} from './registrations.service.js';

// Schemas
export {
  RegistrationStatusSchema,
  PaymentStatusSchema,
  CreateRegistrationSchema,
  UpdateRegistrationStatusSchema,
  UpdatePaymentSchema,
  UpdateRegistrationSchema,
  ListRegistrationsQuerySchema,
  RegistrationIdParamSchema,
  EventIdParamSchema,
  FormIdParamSchema,
  CreateRegistrationNoteSchema,
  PriceBreakdownSchema,
} from './registrations.schema.js';

// Types
export type {
  RegistrationStatus,
  PaymentStatus,
  CreateRegistrationInput,
  UpdateRegistrationInput,
  UpdatePaymentInput,
  CreateRegistrationNoteInput,
  ListRegistrationsQuery,
  PriceBreakdown,
} from './registrations.schema.js';

// Routes
export { registrationsRoutes } from './registrations.routes.js';
export { registrationsPublicRoutes } from './registrations.public.routes.js';
