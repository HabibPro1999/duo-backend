// ============================================================================
// Sponsorships Module - Barrel Export
// ============================================================================

// Service functions
export {
  createSponsorshipBatch,
  listSponsorships,
  getSponsorshipById,
  getSponsorshipByCode,
  updateSponsorship,
  cancelSponsorship,
  deleteSponsorship,
  linkSponsorshipToRegistration,
  linkSponsorshipByCode,
  unlinkSponsorshipFromRegistration,
  getAvailableSponsorships,
  getSponsorshipClientId,
  getLinkedSponsorships,
} from './sponsorships.service.js';

// Service types
export type {
  AvailableSponsorship,
  LinkSponsorshipResult,
  CreateBatchResult,
} from './sponsorships.service.js';

// Utility functions
export {
  generateSponsorshipCode,
  generateUniqueCode,
  calculateSponsorshipTotal,
  calculateApplicableAmount,
  detectCoverageOverlap,
  calculateTotalSponsorshipAmount,
  determineSponsorshipStatus,
} from './sponsorships.utils.js';

// Utility types
export type {
  SponsorshipForCalculation,
  RegistrationForCalculation,
  ExistingUsage,
} from './sponsorships.utils.js';

// Schemas
export {
  SponsorshipStatusSchema,
  BeneficiaryInputSchema,
  SponsorInfoSchema,
  CreateSponsorshipBatchSchema,
  UpdateSponsorshipSchema,
  ListSponsorshipsQuerySchema,
  LinkSponsorshipSchema,
  LinkSponsorshipByCodeSchema,
  SponsorshipIdParamSchema,
  EventIdParamSchema,
  RegistrationIdParamSchema,
  RegistrationSponsorshipParamSchema,
} from './sponsorships.schema.js';

// Types
export type {
  SponsorshipStatus,
  BeneficiaryInput,
  SponsorInfo,
  CreateSponsorshipBatchInput,
  UpdateSponsorshipInput,
  ListSponsorshipsQuery,
  LinkSponsorshipInput,
  LinkSponsorshipByCodeInput,
} from './sponsorships.schema.js';

// Routes
export {
  sponsorshipsRoutes,
  sponsorshipDetailRoutes,
  registrationSponsorshipsRoutes,
} from './sponsorships.routes.js';

export {
  sponsorshipsPublicRoutes,
  sponsorshipsPublicBySlugRoutes,
} from './sponsorships.public.routes.js';
