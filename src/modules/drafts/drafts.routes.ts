import {
  saveDraft,
  getDraftBySessionToken,
  getDraftByEmail,
  deleteDraft,
} from './drafts.service.js';
import {
  SaveDraftSchema,
  SessionTokenParamSchema,
  GetDraftQuerySchema,
  type SaveDraftInput,
  type GetDraftQuery,
} from './drafts.schema.js';
import type { AppInstance } from '@shared/types/fastify.js';

// ============================================================================
// Public Routes (No Auth - for form drafts)
// ============================================================================

export async function draftsPublicRoutes(app: AppInstance): Promise<void> {
  // POST /api/public/drafts - Save or update draft
  app.post<{
    Body: SaveDraftInput;
    Headers: { 'x-draft-session'?: string };
  }>(
    '/',
    {
      schema: { body: SaveDraftSchema },
    },
    async (request, reply) => {
      const sessionToken = request.headers['x-draft-session'];
      const draft = await saveDraft(request.body, sessionToken);

      return reply.status(201).send({
        draft,
        sessionToken: draft.sessionToken,
      });
    }
  );

  // GET /api/public/drafts/lookup - Get draft by email and formId
  // Note: This route must come before /:sessionToken to avoid conflicts
  app.get<{ Querystring: GetDraftQuery }>(
    '/lookup',
    {
      schema: { querystring: GetDraftQuerySchema },
    },
    async (request, reply) => {
      const { email, formId } = request.query;

      if (!email || !formId) {
        throw app.httpErrors.badRequest('Email and formId are required');
      }

      const draft = await getDraftByEmail(email, formId);

      if (!draft) {
        throw app.httpErrors.notFound('No draft found for this email');
      }

      return reply.send({
        hasDraft: true,
        sessionToken: draft.sessionToken,
        currentStep: draft.currentStep,
        updatedAt: draft.updatedAt,
      });
    }
  );

  // GET /api/public/drafts/:sessionToken - Get draft by session token
  app.get<{ Params: { sessionToken: string } }>(
    '/:sessionToken',
    {
      schema: { params: SessionTokenParamSchema },
    },
    async (request, reply) => {
      const draft = await getDraftBySessionToken(request.params.sessionToken);

      if (!draft) {
        throw app.httpErrors.notFound('Draft not found or expired');
      }

      return reply.send(draft);
    }
  );

  // DELETE /api/public/drafts/:sessionToken - Delete draft
  app.delete<{ Params: { sessionToken: string } }>(
    '/:sessionToken',
    {
      schema: { params: SessionTokenParamSchema },
    },
    async (request, reply) => {
      await deleteDraft(request.params.sessionToken);
      return reply.status(204).send();
    }
  );
}
