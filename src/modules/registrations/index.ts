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
  // Self-service editing
  getRegistrationForEdit,
  editRegistrationPublic,
  // Table columns
  getRegistrationTableColumns,
} from './registrations.service.js';

// Service types
export type {
  GetRegistrationForEditResult,
  EditRegistrationPublicResult,
  RegistrationTableColumns,
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
  // Self-service editing schemas
  PublicEditRegistrationSchema,
  RegistrationIdPublicParamSchema,
  AmendmentRecordSchema,
  FormDataChangeSchema,
  AccessChangeSchema,
  // Table column schemas
  TableColumnTypeSchema,
  TableColumnOptionSchema,
  TableColumnSchema,
  RegistrationColumnsResponseSchema,
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
  // Self-service editing types
  PublicEditRegistrationInput,
  AmendmentRecord,
  FormDataChange,
  AccessChange,
  // Table column types
  TableColumnType,
  TableColumnOption,
  TableColumn,
  RegistrationColumnsResponse,
} from './registrations.schema.js';

// Routes
export { registrationsRoutes } from './registrations.routes.js';
export {
  registrationsPublicRoutes,
  registrationEditPublicRoutes,
} from './registrations.public.routes.js';
