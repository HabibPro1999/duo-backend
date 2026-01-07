import { requireAuth } from '@shared/middleware/auth.middleware.js';
import { getEventById } from '@events';
import {
  createEmailTemplate,
  getEmailTemplateById,
  getEmailTemplateClientId,
  listEmailTemplates,
  updateEmailTemplate,
  deleteEmailTemplate,
  duplicateEmailTemplate,
} from './email-template.service.js';
import {
  getAvailableVariables,
  getSampleEmailContext,
  resolveVariables,
} from './email-variable.service.js';
import {
  createEmailCampaign,
  getEmailCampaignById,
  getCampaignClientId,
  listEmailCampaigns,
  startCampaign,
  cancelCampaign,
  getCampaignProgress,
  countRecipients,
  getFilteredRecipients,
  deleteEmailCampaign,
  type CreateCampaignInput,
} from './email-campaign.service.js';
import type { RecipientFilter as ServiceRecipientFilter } from './email.types.js';
import { sendEmail } from './email-sendgrid.service.js';
import {
  EventIdParamSchema,
  EmailTemplateIdParamSchema,
  EmailCampaignIdParamSchema,
  CreateEmailTemplateSchema,
  UpdateEmailTemplateSchema,
  ListEmailTemplatesQuerySchema,
  CreateEmailCampaignSchema,
  ListEmailCampaignsQuerySchema,
  RecipientFilterSchema,
  TestSendEmailSchema,
  type CreateEmailTemplateInput,
  type UpdateEmailTemplateInput,
  type ListEmailTemplatesQuery,
  type CreateEmailCampaignInput,
  type ListEmailCampaignsQuery,
  type RecipientFilter,
  type TestSendEmailInput,
} from './email.schema.js';
import type { AppInstance } from '@shared/types/fastify.js';

const UserRole = {
  SUPER_ADMIN: 0,
  CLIENT_ADMIN: 1,
} as const;

// ============================================================================
// Protected Routes (Admin)
// ============================================================================

export async function emailRoutes(app: AppInstance): Promise<void> {
  app.addHook('onRequest', requireAuth);

  // ==========================================================================
  // EMAIL TEMPLATES
  // ==========================================================================

  // GET /api/events/:eventId/email-templates - List templates for event
  app.get<{
    Params: { eventId: string };
    Querystring: ListEmailTemplatesQuery;
  }>(
    '/:eventId/email-templates',
    {
      schema: {
        params: EventIdParamSchema,
        querystring: ListEmailTemplatesQuerySchema,
      },
    },
    async (request, reply) => {
      const { eventId } = request.params;
      const query = request.query;

      const event = await getEventById(eventId);
      if (!event) {
        throw app.httpErrors.notFound('Event not found');
      }

      const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
      const isOwnClient = request.user!.clientId === event.clientId;

      if (!isSuperAdmin && !isOwnClient) {
        throw app.httpErrors.forbidden('Insufficient permissions');
      }

      const templates = await listEmailTemplates(eventId, query);
      return reply.send(templates);
    }
  );

  // GET /api/events/:eventId/email-templates/variables - Get available variables for event
  app.get<{
    Params: { eventId: string };
  }>(
    '/:eventId/email-templates/variables',
    {
      schema: { params: EventIdParamSchema },
    },
    async (request, reply) => {
      const { eventId } = request.params;

      const event = await getEventById(eventId);
      if (!event) {
        throw app.httpErrors.notFound('Event not found');
      }

      const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
      const isOwnClient = request.user!.clientId === event.clientId;

      if (!isSuperAdmin && !isOwnClient) {
        throw app.httpErrors.forbidden('Insufficient permissions');
      }

      const variables = await getAvailableVariables(eventId);
      return reply.send(variables);
    }
  );

  // POST /api/events/:eventId/email-templates - Create template
  app.post<{
    Params: { eventId: string };
    Body: Omit<CreateEmailTemplateInput, 'eventId'>;
  }>(
    '/:eventId/email-templates',
    {
      schema: {
        params: EventIdParamSchema,
        body: CreateEmailTemplateSchema.omit({ eventId: true }),
      },
    },
    async (request, reply) => {
      const { eventId } = request.params;
      const input = request.body;

      const event = await getEventById(eventId);
      if (!event) {
        throw app.httpErrors.notFound('Event not found');
      }

      const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
      const isOwnClient = request.user!.clientId === event.clientId;

      if (!isSuperAdmin && !isOwnClient) {
        throw app.httpErrors.forbidden('Insufficient permissions');
      }

      const template = await createEmailTemplate({ ...input, eventId });
      return reply.status(201).send(template);
    }
  );

  // GET /api/events/email-templates/:templateId - Get single template
  app.get<{ Params: { templateId: string } }>(
    '/email-templates/:templateId',
    {
      schema: { params: EmailTemplateIdParamSchema },
    },
    async (request, reply) => {
      const { templateId } = request.params;

      const template = await getEmailTemplateById(templateId);
      if (!template) {
        throw app.httpErrors.notFound('Email template not found');
      }

      const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
      const isOwnClient = request.user!.clientId === template.clientId;

      if (!isSuperAdmin && !isOwnClient) {
        throw app.httpErrors.forbidden('Insufficient permissions');
      }

      return reply.send(template);
    }
  );

  // PATCH /api/events/email-templates/:templateId - Update template
  app.patch<{ Params: { templateId: string }; Body: UpdateEmailTemplateInput }>(
    '/email-templates/:templateId',
    {
      schema: {
        params: EmailTemplateIdParamSchema,
        body: UpdateEmailTemplateSchema,
      },
    },
    async (request, reply) => {
      const { templateId } = request.params;
      const input = request.body;

      const clientId = await getEmailTemplateClientId(templateId);
      if (!clientId) {
        throw app.httpErrors.notFound('Email template not found');
      }

      const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
      const isOwnClient = request.user!.clientId === clientId;

      if (!isSuperAdmin && !isOwnClient) {
        throw app.httpErrors.forbidden('Insufficient permissions');
      }

      const template = await updateEmailTemplate(templateId, input);
      return reply.send(template);
    }
  );

  // DELETE /api/events/email-templates/:templateId - Delete template
  app.delete<{ Params: { templateId: string } }>(
    '/email-templates/:templateId',
    {
      schema: { params: EmailTemplateIdParamSchema },
    },
    async (request, reply) => {
      const { templateId } = request.params;

      const clientId = await getEmailTemplateClientId(templateId);
      if (!clientId) {
        throw app.httpErrors.notFound('Email template not found');
      }

      const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
      const isOwnClient = request.user!.clientId === clientId;

      if (!isSuperAdmin && !isOwnClient) {
        throw app.httpErrors.forbidden('Insufficient permissions');
      }

      await deleteEmailTemplate(templateId);
      return reply.status(204).send();
    }
  );

  // POST /api/events/email-templates/:templateId/duplicate - Duplicate template
  app.post<{ Params: { templateId: string }; Body: { name?: string } }>(
    '/email-templates/:templateId/duplicate',
    {
      schema: { params: EmailTemplateIdParamSchema },
    },
    async (request, reply) => {
      const { templateId } = request.params;
      const { name } = request.body || {};

      const clientId = await getEmailTemplateClientId(templateId);
      if (!clientId) {
        throw app.httpErrors.notFound('Email template not found');
      }

      const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
      const isOwnClient = request.user!.clientId === clientId;

      if (!isSuperAdmin && !isOwnClient) {
        throw app.httpErrors.forbidden('Insufficient permissions');
      }

      const template = await duplicateEmailTemplate(templateId, name);
      return reply.status(201).send(template);
    }
  );

  // POST /api/events/email-templates/:templateId/test-send - Send test email
  app.post<{ Params: { templateId: string }; Body: TestSendEmailInput }>(
    '/email-templates/:templateId/test-send',
    {
      schema: {
        params: EmailTemplateIdParamSchema,
        body: TestSendEmailSchema,
      },
    },
    async (request, reply) => {
      const { templateId } = request.params;
      const { recipientEmail, recipientName } = request.body;

      const template = await getEmailTemplateById(templateId);
      if (!template) {
        throw app.httpErrors.notFound('Email template not found');
      }

      const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
      const isOwnClient = request.user!.clientId === template.clientId;

      if (!isSuperAdmin && !isOwnClient) {
        throw app.httpErrors.forbidden('Insufficient permissions');
      }

      // Get sample context for variable resolution
      const sampleContext = getSampleEmailContext();

      // Resolve variables in subject and HTML content
      const resolvedSubject = resolveVariables(template.subject, sampleContext);
      const resolvedHtml = resolveVariables(template.htmlContent || '', sampleContext);
      const resolvedPlainText = resolveVariables(template.plainContent || '', sampleContext);

      // Send test email
      const result = await sendEmail({
        to: recipientEmail,
        toName: recipientName,
        subject: `[TEST] ${resolvedSubject}`,
        html: resolvedHtml,
        plainText: resolvedPlainText,
        categories: ['test-email'],
      });

      if (!result.success) {
        throw app.httpErrors.badGateway(result.error || 'Failed to send test email');
      }

      return reply.send({
        success: true,
        message: `Test email sent to ${recipientEmail}`,
        messageId: result.messageId,
      });
    }
  );

  // ==========================================================================
  // EMAIL CAMPAIGNS
  // ==========================================================================

  // GET /api/events/:eventId/email-campaigns - List campaigns
  app.get<{
    Params: { eventId: string };
    Querystring: ListEmailCampaignsQuery;
  }>(
    '/:eventId/email-campaigns',
    {
      schema: {
        params: EventIdParamSchema,
        querystring: ListEmailCampaignsQuerySchema,
      },
    },
    async (request, reply) => {
      const { eventId } = request.params;
      const query = request.query;

      const event = await getEventById(eventId);
      if (!event) {
        throw app.httpErrors.notFound('Event not found');
      }

      const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
      const isOwnClient = request.user!.clientId === event.clientId;

      if (!isSuperAdmin && !isOwnClient) {
        throw app.httpErrors.forbidden('Insufficient permissions');
      }

      const campaigns = await listEmailCampaigns(eventId, query);
      return reply.send(campaigns);
    }
  );

  // POST /api/events/:eventId/email-campaigns - Create campaign
  app.post<{
    Params: { eventId: string };
    Body: Omit<CreateEmailCampaignInput, 'eventId'>;
  }>(
    '/:eventId/email-campaigns',
    {
      schema: {
        params: EventIdParamSchema,
        body: CreateEmailCampaignSchema.omit({ eventId: true }),
      },
    },
    async (request, reply) => {
      const { eventId } = request.params;
      const input = request.body;

      const event = await getEventById(eventId);
      if (!event) {
        throw app.httpErrors.notFound('Event not found');
      }

      const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
      const isOwnClient = request.user!.clientId === event.clientId;

      if (!isSuperAdmin && !isOwnClient) {
        throw app.httpErrors.forbidden('Insufficient permissions');
      }

      const campaignInput: CreateCampaignInput = {
        ...input,
        eventId,
        createdById: request.user!.id,
        filters: { ...input.filters, eventId } as ServiceRecipientFilter,
      };
      const campaign = await createEmailCampaign(campaignInput);
      return reply.status(201).send(campaign);
    }
  );

  // POST /api/events/:eventId/email-campaigns/preview-recipients - Preview filtered recipients
  app.post<{
    Params: { eventId: string };
    Body: { filters: RecipientFilter };
  }>(
    '/:eventId/email-campaigns/preview-recipients',
    {
      schema: {
        params: EventIdParamSchema,
        body: {
          type: 'object',
          properties: {
            filters: RecipientFilterSchema,
          },
          required: ['filters'],
        },
      },
    },
    async (request, reply) => {
      const { eventId } = request.params;
      const { filters } = request.body;

      const event = await getEventById(eventId);
      if (!event) {
        throw app.httpErrors.notFound('Event not found');
      }

      const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
      const isOwnClient = request.user!.clientId === event.clientId;

      if (!isSuperAdmin && !isOwnClient) {
        throw app.httpErrors.forbidden('Insufficient permissions');
      }

      // Get count and sample of recipients
      const serviceFilters = { ...filters, eventId } as ServiceRecipientFilter;
      const count = await countRecipients(eventId, serviceFilters);
      const recipients = await getFilteredRecipients(eventId, serviceFilters);

      // Return count and a sample (first 10)
      return reply.send({
        count,
        sample: recipients.slice(0, 10),
      });
    }
  );

  // GET /api/events/email-campaigns/:campaignId - Get campaign
  app.get<{ Params: { campaignId: string } }>(
    '/email-campaigns/:campaignId',
    {
      schema: { params: EmailCampaignIdParamSchema },
    },
    async (request, reply) => {
      const { campaignId } = request.params;

      const campaign = await getEmailCampaignById(campaignId);
      if (!campaign) {
        throw app.httpErrors.notFound('Email campaign not found');
      }

      const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
      const isOwnClient = request.user!.clientId === campaign.clientId;

      if (!isSuperAdmin && !isOwnClient) {
        throw app.httpErrors.forbidden('Insufficient permissions');
      }

      return reply.send(campaign);
    }
  );

  // POST /api/events/email-campaigns/:campaignId/start - Start campaign
  app.post<{ Params: { campaignId: string } }>(
    '/email-campaigns/:campaignId/start',
    {
      schema: { params: EmailCampaignIdParamSchema },
    },
    async (request, reply) => {
      const { campaignId } = request.params;

      const clientId = await getCampaignClientId(campaignId);
      if (!clientId) {
        throw app.httpErrors.notFound('Email campaign not found');
      }

      const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
      const isOwnClient = request.user!.clientId === clientId;

      if (!isSuperAdmin && !isOwnClient) {
        throw app.httpErrors.forbidden('Insufficient permissions');
      }

      await startCampaign(campaignId);
      return reply.send({ success: true, message: 'Campaign started' });
    }
  );

  // POST /api/events/email-campaigns/:campaignId/cancel - Cancel campaign
  app.post<{ Params: { campaignId: string } }>(
    '/email-campaigns/:campaignId/cancel',
    {
      schema: { params: EmailCampaignIdParamSchema },
    },
    async (request, reply) => {
      const { campaignId } = request.params;

      const clientId = await getCampaignClientId(campaignId);
      if (!clientId) {
        throw app.httpErrors.notFound('Email campaign not found');
      }

      const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
      const isOwnClient = request.user!.clientId === clientId;

      if (!isSuperAdmin && !isOwnClient) {
        throw app.httpErrors.forbidden('Insufficient permissions');
      }

      await cancelCampaign(campaignId);
      return reply.send({ success: true, message: 'Campaign cancelled' });
    }
  );

  // GET /api/events/email-campaigns/:campaignId/progress - Get progress
  app.get<{ Params: { campaignId: string } }>(
    '/email-campaigns/:campaignId/progress',
    {
      schema: { params: EmailCampaignIdParamSchema },
    },
    async (request, reply) => {
      const { campaignId } = request.params;

      const clientId = await getCampaignClientId(campaignId);
      if (!clientId) {
        throw app.httpErrors.notFound('Email campaign not found');
      }

      const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
      const isOwnClient = request.user!.clientId === clientId;

      if (!isSuperAdmin && !isOwnClient) {
        throw app.httpErrors.forbidden('Insufficient permissions');
      }

      const progress = await getCampaignProgress(campaignId);
      return reply.send(progress);
    }
  );

  // DELETE /api/events/email-campaigns/:campaignId - Delete campaign
  app.delete<{ Params: { campaignId: string } }>(
    '/email-campaigns/:campaignId',
    {
      schema: { params: EmailCampaignIdParamSchema },
    },
    async (request, reply) => {
      const { campaignId } = request.params;

      const clientId = await getCampaignClientId(campaignId);
      if (!clientId) {
        throw app.httpErrors.notFound('Email campaign not found');
      }

      const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
      const isOwnClient = request.user!.clientId === clientId;

      if (!isSuperAdmin && !isOwnClient) {
        throw app.httpErrors.forbidden('Insufficient permissions');
      }

      await deleteEmailCampaign(campaignId);
      return reply.status(204).send();
    }
  );
}
