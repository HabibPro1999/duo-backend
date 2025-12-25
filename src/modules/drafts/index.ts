// ============================================================================
// Drafts Module - Barrel Export
// ============================================================================

// Services
export {
  saveDraft,
  getDraftBySessionToken,
  getDraftByEmail,
  deleteDraft,
  deleteDraftById,
  cleanupExpiredDrafts,
  draftExists,
} from './drafts.service.js';

// Schemas & Types
export {
  DraftAccessSelectionSchema,
  SaveDraftSchema,
  UpdateDraftSchema,
  SessionTokenParamSchema,
  GetDraftQuerySchema,
  DraftResponseSchema,
  DraftLookupResponseSchema,
  type DraftAccessSelection,
  type SaveDraftInput,
  type UpdateDraftInput,
  type GetDraftQuery,
  type DraftResponse,
  type DraftLookupResponse,
} from './drafts.schema.js';

// Routes
export { draftsPublicRoutes } from './drafts.routes.js';
