import { getFormByEventSlug } from './forms.service.js';
import { EventSlugParamSchema } from '@events';
import type { AppInstance } from '@shared/types/fastify.js';

export async function formsPublicRoutes(app: AppInstance): Promise<void> {
  // NO auth hook - these routes are public

  // GET /api/forms/public/:slug - Get published form by event slug with event and client info
  app.get<{ Params: { slug: string } }>(
    '/:slug',
    {
      schema: { params: EventSlugParamSchema },
    },
    async (request, reply) => {
      const form = await getFormByEventSlug(request.params.slug);
      if (!form) {
        throw app.httpErrors.notFound('Form not found or not published');
      }

      return reply.send(form);
    }
  );
}
