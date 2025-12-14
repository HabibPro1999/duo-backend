import type { FastifyInstance } from 'fastify';
import { AppError } from '@shared/errors/app-error.js';
import { ErrorCodes } from '@shared/errors/error-codes.js';
import { getFormByEventSlug } from './forms.service.js';
import { EventSlugParamSchema } from '@events';

export async function formsPublicRoutes(app: FastifyInstance): Promise<void> {
  // NO auth hook - these routes are public

  // GET /api/forms/public/:eventSlug - Get published form by event slug with event and client info
  app.get('/:eventSlug', async (request, reply) => {
    const { slug: eventSlug } = EventSlugParamSchema.parse(request.params);

    const form = await getFormByEventSlug(eventSlug);
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
