// =============================================================================
// EMAIL QUEUE SERVICE
// Manages the database-backed email queue for reliable delivery with retries
// =============================================================================

import { prisma } from '@/database/client.js'
import { logger } from '@shared/utils/logger.js'
import { sendEmail } from './email-sendgrid.service.js'
import { resolveVariables, buildEmailContextWithAccess } from './email-variable.service.js'
import { Prisma } from '@prisma/client'
import type { EmailContext, AutomaticEmailTrigger } from './email.types.js'

// =============================================================================
// TYPES
// =============================================================================

// Type for registration with all needed relations for email context building
type RegistrationWithRelations = Prisma.RegistrationGetPayload<{
  include: {
    event: {
      include: { client: true }
    }
    form: true
  }
}>

// Email status enum (mirrors Prisma enum)
type EmailStatus = 'QUEUED' | 'SENDING' | 'SENT' | 'DELIVERED' | 'OPENED' | 'CLICKED' | 'BOUNCED' | 'DROPPED' | 'FAILED' | 'SKIPPED'

// Type guard for EmailContext - validates required fields at runtime
function isValidEmailContext(obj: unknown): obj is EmailContext {
  if (!obj || typeof obj !== 'object') return false
  const ctx = obj as Record<string, unknown>
  // Check for essential required fields
  return (
    typeof ctx.firstName === 'string' &&
    typeof ctx.email === 'string' &&
    typeof ctx.eventName === 'string'
  )
}

// =============================================================================
// QUEUE EMAIL
// =============================================================================

export interface QueueEmailInput {
  // Source (one required)
  trigger?: AutomaticEmailTrigger
  campaignId?: string

  // Target
  registrationId?: string
  recipientEmail: string
  recipientName?: string

  // Template
  templateId: string

  // Pre-built context (optional)
  contextSnapshot?: Record<string, unknown>
}

export async function queueEmail(input: QueueEmailInput) {
  return prisma.emailLog.create({
    data: {
      trigger: input.trigger,
      campaignId: input.campaignId,
      templateId: input.templateId,
      registrationId: input.registrationId,
      recipientEmail: input.recipientEmail,
      recipientName: input.recipientName,
      subject: '', // Will be resolved when processing
      status: 'QUEUED',
      contextSnapshot: input.contextSnapshot ?? Prisma.JsonNull
    }
  })
}

// =============================================================================
// QUEUE BULK EMAILS (For Campaigns)
// =============================================================================

export async function queueBulkEmails(
  campaignId: string,
  templateId: string,
  registrations: Array<{
    id: string
    email: string
    firstName?: string | null
    lastName?: string | null
  }>
): Promise<number> {
  const emailLogs = registrations.map(reg => ({
    campaignId,
    templateId,
    registrationId: reg.id,
    recipientEmail: reg.email,
    recipientName: [reg.firstName, reg.lastName].filter(Boolean).join(' ') || null,
    subject: '',
    status: 'QUEUED' as EmailStatus
  }))

  const result = await prisma.emailLog.createMany({
    data: emailLogs
  })

  return result.count
}

// =============================================================================
// PROCESS QUEUE (Background Worker)
// =============================================================================

export interface ProcessQueueResult {
  processed: number
  sent: number
  failed: number
  skipped: number
}

export async function processEmailQueue(batchSize = 50): Promise<ProcessQueueResult> {
  const result: ProcessQueueResult = {
    processed: 0,
    sent: 0,
    failed: 0,
    skipped: 0
  }

  // Get batch of queued emails with row-level locking
  const batch = await prisma.$transaction(async (tx) => {
    const emails = await tx.emailLog.findMany({
      where: {
        status: 'QUEUED',
        // Process emails that haven't exceeded max retries
        retryCount: { lt: 4 },
      },
      take: batchSize,
      orderBy: { queuedAt: 'asc' },
      include: {
        template: true,
        registration: {
          include: {
            event: { include: { client: true } },
            form: true
          }
        }
      }
    })

    if (emails.length > 0) {
      await tx.emailLog.updateMany({
        where: { id: { in: emails.map((e: { id: string }) => e.id) } },
        data: { status: 'SENDING' }
      })
    }

    return emails
  })

  if (batch.length === 0) {
    return result
  }

  result.processed = batch.length

  // Process each email
  for (const emailLog of batch) {
    try {
      // Skip if no template
      if (!emailLog.template) {
        await markAsSkipped(emailLog.id, 'No template found')
        result.skipped++
        continue
      }

      // Skip if template is inactive
      if (!emailLog.template.isActive) {
        await markAsSkipped(emailLog.id, 'Template is inactive')
        result.skipped++
        continue
      }

      // Build context
      let context: EmailContext | null = null

      if (emailLog.contextSnapshot && isValidEmailContext(emailLog.contextSnapshot)) {
        context = emailLog.contextSnapshot
      } else if (emailLog.registration) {
        // Build context from registration
        context = await buildEmailContextWithAccess(emailLog.registration as RegistrationWithRelations)
      }

      if (!context || Object.keys(context).length === 0) {
        await markAsSkipped(emailLog.id, 'Could not build email context')
        result.skipped++
        continue
      }

      // Resolve variables
      const resolvedSubject = resolveVariables(emailLog.template.subject, context)
      const resolvedHtml = resolveVariables(emailLog.template.htmlContent || '', context)
      const resolvedPlain = resolveVariables(emailLog.template.plainContent || '', context)

      // Update subject in log
      await prisma.emailLog.update({
        where: { id: emailLog.id },
        data: { subject: resolvedSubject }
      })

      // Send via SendGrid
      const sendResult = await sendEmail({
        to: emailLog.recipientEmail,
        toName: emailLog.recipientName || undefined,
        subject: resolvedSubject,
        html: resolvedHtml,
        plainText: resolvedPlain,
        trackingId: emailLog.id
      })

      if (sendResult.success) {
        await markAsSent(emailLog.id, sendResult.messageId)
        result.sent++
      } else {
        await markAsFailed(emailLog.id, sendResult.error || 'Unknown error', emailLog.retryCount)
        result.failed++
      }
    } catch (error: unknown) {
      const err = error as Error
      logger.error({ emailLogId: emailLog.id, error: err.message }, 'Error processing email')
      await markAsFailed(emailLog.id, err.message, emailLog.retryCount)
      result.failed++
    }
  }

  return result
}

// =============================================================================
// STATUS UPDATES
// =============================================================================

async function markAsSent(id: string, messageId?: string) {
  await prisma.emailLog.update({
    where: { id },
    data: {
      status: 'SENT',
      sendgridMessageId: messageId,
      sentAt: new Date()
    }
  })
}

async function markAsFailed(id: string, errorMessage: string, currentRetryCount: number) {
  const maxRetries = 3
  const shouldRetry = currentRetryCount < maxRetries

  await prisma.emailLog.update({
    where: { id },
    data: {
      status: shouldRetry ? 'QUEUED' : 'FAILED',
      errorMessage,
      retryCount: { increment: 1 },
      failedAt: shouldRetry ? null : new Date()
    }
  })
}

async function markAsSkipped(id: string, reason: string) {
  await prisma.emailLog.update({
    where: { id },
    data: {
      status: 'SKIPPED',
      errorMessage: reason
    }
  })
}

// =============================================================================
// WEBHOOK STATUS UPDATES
// =============================================================================

interface EmailLogUpdateData {
  status?: EmailStatus
  deliveredAt?: Date
  openedAt?: Date
  clickedAt?: Date
  bouncedAt?: Date
  errorMessage?: string
}

export async function updateEmailStatusFromWebhook(
  emailLogId: string,
  event: 'delivered' | 'open' | 'click' | 'bounce' | 'dropped',
  metadata?: { url?: string; reason?: string }
) {
  const updates: EmailLogUpdateData = {}

  switch (event) {
    case 'delivered':
      updates.status = 'DELIVERED'
      updates.deliveredAt = new Date()
      break
    case 'open':
      updates.status = 'OPENED'
      updates.openedAt = new Date()
      break
    case 'click':
      updates.status = 'CLICKED'
      updates.clickedAt = new Date()
      break
    case 'bounce':
      updates.status = 'BOUNCED'
      updates.bouncedAt = new Date()
      updates.errorMessage = metadata?.reason || 'Bounced'
      break
    case 'dropped':
      updates.status = 'DROPPED'
      updates.errorMessage = metadata?.reason || 'Dropped'
      break
  }

  try {
    await prisma.emailLog.update({
      where: { id: emailLogId },
      data: updates
    })

    // Update campaign statistics if this email belongs to a campaign
    const emailLog = await prisma.emailLog.findUnique({
      where: { id: emailLogId },
      select: { campaignId: true }
    })

    if (emailLog?.campaignId) {
      await updateCampaignStats(emailLog.campaignId)
    }
  } catch (error) {
    logger.error({ emailLogId, event, error }, 'Failed to update email status from webhook')
  }
}

// =============================================================================
// CAMPAIGN STATISTICS
// =============================================================================

export async function updateCampaignStats(campaignId: string) {
  const stats = await prisma.emailLog.groupBy({
    by: ['status'],
    where: { campaignId },
    _count: { status: true }
  })

  const statusCounts = stats.reduce((acc: Record<string, number>, s: { status: string; _count: { status: number } }) => {
    acc[s.status] = s._count.status
    return acc
  }, {} as Record<string, number>)

  await prisma.emailCampaign.update({
    where: { id: campaignId },
    data: {
      sentCount: (statusCounts['SENT'] || 0) +
                 (statusCounts['DELIVERED'] || 0) +
                 (statusCounts['OPENED'] || 0) +
                 (statusCounts['CLICKED'] || 0),
      failedCount: (statusCounts['FAILED'] || 0) +
                   (statusCounts['BOUNCED'] || 0) +
                   (statusCounts['DROPPED'] || 0),
      openedCount: statusCounts['OPENED'] || 0,
      clickedCount: statusCounts['CLICKED'] || 0
    }
  })
}

// =============================================================================
// UTILITIES
// =============================================================================

// Exponential backoff utility (for future use with proper retry timing)
function _getBackoffMs(retryCount: number): number {
  // Exponential backoff: 1min, 5min, 15min
  const backoffs = [60000, 300000, 900000]
  return backoffs[Math.min(retryCount, backoffs.length - 1)]
}
void _getBackoffMs // Prevent unused variable warning

// =============================================================================
// QUEUE STATS
// =============================================================================

export async function getQueueStats() {
  const stats = await prisma.emailLog.groupBy({
    by: ['status'],
    _count: { status: true }
  })

  return stats.reduce((acc: Record<string, number>, s: { status: string; _count: { status: number } }) => {
    acc[s.status] = s._count.status
    return acc
  }, {} as Record<string, number>)
}
