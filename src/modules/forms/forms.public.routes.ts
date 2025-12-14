import type { FastifyInstance } from 'fastify';
import { AppError } from '@shared/errors/app-error.js';
import { ErrorCodes } from '@shared/errors/error-codes.js';
import { getFormBySlug } from './forms.service.js';
import { FormSlugParamSchema } from './forms.schema.js';

export async function formsPublicRoutes(app: FastifyInstance): Promise<void> {
  // NO auth hook - these routes are public

  // GET /api/forms/public/:slug - Get published form by slug with event and client info
  app.get('/:slug', async (request, reply) => {
    const { slug } = FormSlugParamSchema.parse(request.params);

    const form = await getFormBySlug(slug);
    if (!form) {
      throw new AppError(
        'Form not found or not published',
        404,
        true,
        ErrorCodes.NOT_FOUND
      );
    }

    return reply.send(form);
  });
}
