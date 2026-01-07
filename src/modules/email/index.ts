// ============================================================================
// Email Module - Barrel Export
// ============================================================================

// ============================================================================
// Schemas
// ============================================================================

export {
  EmailTemplateCategorySchema,
  AutomaticEmailTriggerSchema,
  CampaignStatusSchema,
  EmailStatusSchema,
  TiptapDocumentSchema,
  CreateEmailTemplateSchema,
  UpdateEmailTemplateSchema,
  ListEmailTemplatesQuerySchema,
  RecipientFilterSchema,
  CreateEmailCampaignSchema,
  UpdateEmailCampaignSchema,
  ListEmailCampaignsQuerySchema,
  TestSendEmailSchema,
  EmailTemplateIdParamSchema,
  EmailCampaignIdParamSchema,
  EventIdParamSchema,
} from './email.schema.js';

// ============================================================================
// Schema Types
// ============================================================================

export type {
  EmailTemplateCategory,
  AutomaticEmailTrigger,
  CampaignStatus,
  EmailStatus,
  TiptapDocument,
  RecipientFilter,
  CreateEmailTemplateInput,
  UpdateEmailTemplateInput,
  ListEmailTemplatesQuery,
  CreateEmailCampaignInput,
  UpdateEmailCampaignInput,
  ListEmailCampaignsQuery,
  TestSendEmailInput,
} from './email.schema.js';

// ============================================================================
// Email Template Service
// ============================================================================

export {
  createEmailTemplate,
  getEmailTemplateById,
  getEmailTemplateWithEvent,
  getEmailTemplateClientId,
  listEmailTemplates,
  getTemplateByTrigger,
  updateEmailTemplate,
  deleteEmailTemplate,
  duplicateEmailTemplate,
} from './email-template.service.js';

// ============================================================================
// Email Variable Service
// ============================================================================

export {
  BASE_VARIABLES,
  getAvailableVariables,
  buildEmailContext,
  buildEmailContextWithAccess,
  resolveVariables,
  sanitizeForHtml,
  sanitizeUrl,
  getSampleEmailContext,
} from './email-variable.service.js';

// ============================================================================
// Email Campaign Service
// ============================================================================

export {
  createEmailCampaign,
  getEmailCampaignById,
  getCampaignClientId,
  listEmailCampaigns,
  countRecipients,
  getFilteredRecipients,
  startCampaign,
  cancelCampaign,
  getCampaignProgress,
  finalizeCampaignIfComplete,
  deleteEmailCampaign,
} from './email-campaign.service.js';

export type {
  CreateCampaignInput,
  CampaignProgress,
} from './email-campaign.service.js';

// ============================================================================
// Email Queue Service
// ============================================================================

export {
  queueEmail,
  queueBulkEmails,
  processEmailQueue,
  updateEmailStatusFromWebhook,
  updateCampaignStats,
  getQueueStats,
} from './email-queue.service.js';

export type {
  QueueEmailInput,
  ProcessQueueResult,
} from './email-queue.service.js';

// ============================================================================
// Email SendGrid Service
// ============================================================================

export {
  sendEmail,
  sendBatchEmails,
  verifyWebhookSignature,
  WebhookHeaders,
  parseWebhookEvents,
  isFailureEvent,
  isDeliveryEvent,
  isEngagementEvent,
  isSendGridConfigured,
  getSendGridStatus,
} from './email-sendgrid.service.js';

export type {
  SendEmailInput,
  SendEmailResult,
  BatchEmailInput,
  BatchSendResult,
  SendGridEventType,
  SendGridWebhookEvent,
} from './email-sendgrid.service.js';

// ============================================================================
// Email Renderer Service
// ============================================================================

export {
  renderTemplateToMjml,
  compileMjmlToHtml,
  extractPlainText,
  renderNode,
  renderInlineContent,
  renderInlineNode,
  applyMarks,
  escapeHtml,
} from './email-renderer.service.js';

// ============================================================================
// Types (from email.types.ts)
// ============================================================================

export type {
  TiptapDocument as TiptapDocumentType,
  TiptapNode,
  TiptapMark,
  VariableMentionNode,
  EmailContext,
  MjmlCompilationResult,
  RecipientFilter as RecipientFilterType,
  FormFieldFilter,
  VariableDefinition,
} from './email.types.js';

// ============================================================================
// Routes
// ============================================================================

export { emailRoutes } from './email.routes.js';
