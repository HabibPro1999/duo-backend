import { getFormByEventSlug, getSponsorFormByEventSlug } from './forms.service.js';
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

  // GET /api/forms/public/:slug/sponsor - Get sponsor form by event slug
  app.get<{ Params: { slug: string } }>(
    '/:slug/sponsor',
    {
      schema: { params: EventSlugParamSchema },
    },
    async (request, reply) => {
      const form = await getSponsorFormByEventSlug(request.params.slug);
      if (!form) {
        throw app.httpErrors.notFound('Sponsor form not found or event not open');
      }

      // Transform response for public consumption
      return reply.send({
        formId: form.id,
        schema: form.schema,
        event: {
          id: form.event.id,
          name: form.event.name,
          slug: form.event.slug,
          status: form.event.status,
          startDate: form.event.startDate,
          endDate: form.event.endDate,
          location: form.event.location,
          client: form.event.client,
        },
        pricing: form.event.pricing,
        accessItems: form.event.access,
      });
    }
  );
}
