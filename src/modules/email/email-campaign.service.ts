// =============================================================================
// EMAIL CAMPAIGN SERVICE
// Manages manual email campaigns - creating, filtering recipients, sending, and tracking
// =============================================================================

import { prisma } from '@/database/client.js';
import { AppError } from '@shared/errors/app-error.js';
import { ErrorCodes } from '@shared/errors/error-codes.js';
import { paginate, getSkip } from '@shared/utils/pagination.js';
import { logger } from '@shared/utils/logger.js';
import { queueBulkEmails } from './email-queue.service.js';
import { RecipientFilterSchema } from './email.schema.js';
import { Prisma } from '@prisma/client';
import type { RecipientFilter, FormFieldFilter } from './email.types.js';

// Type aliases for Prisma generated types
type EmailCampaign = Prisma.EmailCampaignGetPayload<object>;
type CampaignStatus = Prisma.EmailCampaignCreateInput['status'];
type Registration = Prisma.RegistrationGetPayload<object>;

// =============================================================================
// CREATE CAMPAIGN
// =============================================================================

export interface CreateCampaignInput {
  eventId: string;
  templateId: string;
  name: string;
  filters: RecipientFilter;
  scheduledFor?: Date | null;
  createdById: string;
}

export async function createEmailCampaign(input: CreateCampaignInput): Promise<EmailCampaign> {
  // Get the event to find clientId
  const event = await prisma.event.findUnique({
    where: { id: input.eventId },
    select: { clientId: true },
  });

  if (!event) {
    throw new AppError('Event not found', 404, true, ErrorCodes.NOT_FOUND);
  }

  // Verify template exists and belongs to the event
  const template = await prisma.emailTemplate.findUnique({
    where: { id: input.templateId },
  });

  if (!template) {
    throw new AppError('Email template not found', 404, true, ErrorCodes.NOT_FOUND);
  }

  if (template.eventId && template.eventId !== input.eventId) {
    throw new AppError(
      'Template does not belong to this event',
      400,
      true,
      ErrorCodes.VALIDATION_ERROR
    );
  }

  // Count recipients based on filters
  const recipientCount = await countRecipients(input.eventId, input.filters);

  return prisma.emailCampaign.create({
    data: {
      clientId: event.clientId,
      eventId: input.eventId,
      templateId: input.templateId,
      name: input.name,
      filters: input.filters as unknown as Prisma.InputJsonValue,
      recipientCount,
      status: input.scheduledFor ? 'SCHEDULED' : 'DRAFT',
      scheduledFor: input.scheduledFor ?? null,
      createdById: input.createdById,
    },
  });
}

// =============================================================================
// READ
// =============================================================================

export async function getEmailCampaignById(id: string) {
  return prisma.emailCampaign.findUnique({
    where: { id },
    include: {
      template: true,
      event: true,
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function getCampaignClientId(id: string): Promise<string | null> {
  const campaign = await prisma.emailCampaign.findUnique({
    where: { id },
    select: { clientId: true },
  });
  return campaign?.clientId ?? null;
}

// =============================================================================
// LIST
// =============================================================================

export async function listEmailCampaigns(
  eventId: string,
  query: {
    page?: number;
    limit?: number;
    status?: CampaignStatus;
  }
) {
  const { page = 1, limit = 20, status } = query;
  const skip = getSkip({ page, limit });

  const where: Prisma.EmailCampaignWhereInput = {
    eventId,
    ...(status && { status }),
  };

  const [data, total] = await Promise.all([
    prisma.emailCampaign.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        template: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
    }),
    prisma.emailCampaign.count({ where }),
  ]);

  return paginate(data, total, { page, limit });
}

// =============================================================================
// RECIPIENT FILTERING
// =============================================================================

export async function countRecipients(
  eventId: string,
  filters: RecipientFilter
): Promise<number> {
  const where = buildRecipientWhereClause(eventId, filters);
  return prisma.registration.count({ where });
}

export async function getFilteredRecipients(
  eventId: string,
  filters: RecipientFilter
): Promise<Array<Pick<Registration, 'id' | 'email' | 'firstName' | 'lastName'>>> {
  const where = buildRecipientWhereClause(eventId, filters);

  return prisma.registration.findMany({
    where,
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
    },
  });
}

function buildRecipientWhereClause(
  eventId: string,
  filters: RecipientFilter
): Prisma.RegistrationWhereInput {
  const where: Prisma.RegistrationWhereInput = {
    eventId,
  };

  // Payment status filter
  if (filters.paymentStatus && filters.paymentStatus.length > 0) {
    where.paymentStatus = { in: filters.paymentStatus as Prisma.EnumPaymentStatusFilter['in'] };
  }

  // Date range filters
  if (filters.registeredAfter) {
    where.submittedAt = { ...(where.submittedAt as object), gte: filters.registeredAfter };
  }
  if (filters.registeredBefore) {
    where.submittedAt = { ...(where.submittedAt as object), lte: filters.registeredBefore };
  }

  // Access type filters
  if (filters.hasAccessTypes && filters.hasAccessTypes.length > 0) {
    where.accessTypeIds = { hasEvery: filters.hasAccessTypes };
  }
  if (filters.hasAnyAccessTypes && filters.hasAnyAccessTypes.length > 0) {
    where.accessTypeIds = { hasSome: filters.hasAnyAccessTypes };
  }
  if (filters.excludeAccessTypes && filters.excludeAccessTypes.length > 0) {
    where.NOT = {
      accessTypeIds: { hasSome: filters.excludeAccessTypes },
    };
  }

  // Include/exclude specific registrations
  if (filters.includeRegistrationIds && filters.includeRegistrationIds.length > 0) {
    where.id = { in: filters.includeRegistrationIds };
  }
  if (filters.excludeRegistrationIds && filters.excludeRegistrationIds.length > 0) {
    where.id = { ...(where.id as object), notIn: filters.excludeRegistrationIds };
  }

  // Form field filters (JSON query)
  if (filters.formFieldFilters && filters.formFieldFilters.length > 0) {
    where.AND = filters.formFieldFilters.map((f) => buildFormFieldCondition(f));
  }

  return where;
}

function buildFormFieldCondition(filter: FormFieldFilter): Prisma.RegistrationWhereInput {
  const { fieldId, operator, value } = filter;
  const path = ['formData', fieldId];

  switch (operator) {
    case 'equals':
      return { formData: { path, equals: value } };
    case 'not_equals':
      return { NOT: { formData: { path, equals: value } } };
    case 'contains':
      return { formData: { path, string_contains: String(value) } };
    case 'not_contains':
      return { NOT: { formData: { path, string_contains: String(value) } } };
    case 'in':
      // Value should be an array
      return { formData: { path, array_contains: value } };
    case 'not_in':
      return { NOT: { formData: { path, array_contains: value } } };
    case 'is_empty':
      return {
        OR: [
          { formData: { path, equals: Prisma.JsonNull } },
          { formData: { path, equals: '' } },
        ],
      };
    case 'is_not_empty':
      return {
        NOT: {
          OR: [
            { formData: { path, equals: Prisma.JsonNull } },
            { formData: { path, equals: '' } },
          ],
        },
      };
    default:
      return {};
  }
}

// =============================================================================
// SEND CAMPAIGN
// =============================================================================

export async function startCampaign(campaignId: string): Promise<void> {
  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: campaignId },
    include: { template: true },
  });

  if (!campaign) {
    throw new AppError('Campaign not found', 404, true, ErrorCodes.NOT_FOUND);
  }

  if (campaign.status !== 'DRAFT' && campaign.status !== 'SCHEDULED') {
    throw new AppError(
      `Cannot start campaign with status "${campaign.status}"`,
      400,
      true,
      ErrorCodes.VALIDATION_ERROR
    );
  }

  if (!campaign.template.isActive) {
    throw new AppError(
      'Cannot send campaign with inactive template',
      400,
      true,
      ErrorCodes.VALIDATION_ERROR
    );
  }

  // Update status to processing
  await prisma.emailCampaign.update({
    where: { id: campaignId },
    data: {
      status: 'PROCESSING',
      startedAt: new Date(),
    },
  });

  try {
    // Get recipients
    // Validate filters at runtime with Zod
    const filtersParsed = RecipientFilterSchema.safeParse(campaign.filters);
    if (!filtersParsed.success) {
      logger.error({ campaignId, errors: filtersParsed.error }, 'Invalid campaign filters');
      throw new AppError('Invalid campaign filters', 400, true, ErrorCodes.VALIDATION_ERROR);
    }
    const filters = filtersParsed.data;
    const recipients = await getFilteredRecipients(campaign.eventId, filters);

    // Update actual recipient count
    await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: { recipientCount: recipients.length },
    });

    if (recipients.length === 0) {
      await prisma.emailCampaign.update({
        where: { id: campaignId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });
      return;
    }

    // Queue all emails
    await queueBulkEmails(campaignId, campaign.templateId, recipients);

    logger.info({ campaignId, recipientCount: recipients.length }, 'Campaign emails queued');
  } catch (error: unknown) {
    const err = error as Error;
    logger.error({ campaignId, error: err.message }, 'Failed to start campaign');

    await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: {
        status: 'FAILED',
      },
    });

    throw error;
  }
}

// =============================================================================
// CANCEL CAMPAIGN
// =============================================================================

export async function cancelCampaign(campaignId: string): Promise<void> {
  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: campaignId },
  });

  if (!campaign) {
    throw new AppError('Campaign not found', 404, true, ErrorCodes.NOT_FOUND);
  }

  if (campaign.status === 'COMPLETED' || campaign.status === 'CANCELLED') {
    throw new AppError(
      `Cannot cancel campaign with status "${campaign.status}"`,
      400,
      true,
      ErrorCodes.VALIDATION_ERROR
    );
  }

  // Delete queued (unsent) emails
  await prisma.emailLog.deleteMany({
    where: {
      campaignId,
      status: 'QUEUED',
    },
  });

  // Update campaign status
  await prisma.emailCampaign.update({
    where: { id: campaignId },
    data: {
      status: 'CANCELLED',
      completedAt: new Date(),
    },
  });
}

// =============================================================================
// CAMPAIGN PROGRESS
// =============================================================================

export interface CampaignProgress {
  campaignId: string;
  status: CampaignStatus;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  progress: number; // 0-100
  estimatedTimeRemaining?: number; // seconds
}

export async function getCampaignProgress(campaignId: string): Promise<CampaignProgress> {
  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: campaignId },
  });

  if (!campaign) {
    throw new AppError('Campaign not found', 404, true, ErrorCodes.NOT_FOUND);
  }

  // Get current stats
  const stats = await prisma.emailLog.groupBy({
    by: ['status'],
    where: { campaignId },
    _count: { status: true },
  });

  const statusCounts = stats.reduce<Record<string, number>>(
    (acc, s) => {
      acc[s.status] = s._count.status;
      return acc;
    },
    {}
  );

  const queuedCount = statusCounts['QUEUED'] || 0;
  const sendingCount = statusCounts['SENDING'] || 0;
  const processedCount = campaign.recipientCount - queuedCount - sendingCount;

  const progress =
    campaign.recipientCount > 0
      ? Math.round((processedCount / campaign.recipientCount) * 100)
      : 100;

  // Estimate remaining time (rough: 10 emails/second)
  const remaining = queuedCount + sendingCount;
  const estimatedTimeRemaining = remaining > 0 ? Math.ceil(remaining / 10) : undefined;

  return {
    campaignId,
    status: campaign.status,
    recipientCount: campaign.recipientCount,
    sentCount: campaign.sentCount,
    failedCount: campaign.failedCount,
    progress,
    estimatedTimeRemaining,
  };
}

// =============================================================================
// FINALIZE CAMPAIGN
// =============================================================================

export async function finalizeCampaignIfComplete(campaignId: string): Promise<void> {
  const stats = await prisma.emailLog.groupBy({
    by: ['status'],
    where: { campaignId },
    _count: { status: true },
  });

  const statusCounts = stats.reduce<Record<string, number>>(
    (acc, s) => {
      acc[s.status] = s._count.status;
      return acc;
    },
    {}
  );

  const queuedCount = statusCounts['QUEUED'] || 0;
  const sendingCount = statusCounts['SENDING'] || 0;

  // Still processing
  if (queuedCount > 0 || sendingCount > 0) {
    return;
  }

  // All done - determine final status
  const failedCount =
    (statusCounts['FAILED'] || 0) +
    (statusCounts['BOUNCED'] || 0) +
    (statusCounts['DROPPED'] || 0);
  const sentCount =
    (statusCounts['SENT'] || 0) +
    (statusCounts['DELIVERED'] || 0) +
    (statusCounts['OPENED'] || 0) +
    (statusCounts['CLICKED'] || 0);

  const finalStatus: CampaignStatus =
    failedCount === 0 ? 'COMPLETED' : sentCount === 0 ? 'FAILED' : 'PARTIALLY_COMPLETED';

  await prisma.emailCampaign.update({
    where: { id: campaignId },
    data: {
      status: finalStatus,
      sentCount,
      failedCount,
      completedAt: new Date(),
    },
  });
}

// =============================================================================
// DELETE CAMPAIGN
// =============================================================================

export async function deleteEmailCampaign(campaignId: string): Promise<void> {
  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: campaignId },
  });

  if (!campaign) {
    throw new AppError('Campaign not found', 404, true, ErrorCodes.NOT_FOUND);
  }

  if (campaign.status === 'PROCESSING') {
    throw new AppError(
      'Cannot delete campaign that is currently processing',
      400,
      true,
      ErrorCodes.VALIDATION_ERROR
    );
  }

  // Delete email logs first
  await prisma.emailLog.deleteMany({
    where: { campaignId },
  });

  // Delete campaign
  await prisma.emailCampaign.delete({
    where: { id: campaignId },
  });
}
