// Services
export {
  createForm,
  getFormById,
  getFormByEventSlug,
  updateForm,
  listForms,
  deleteForm,
  formExists,
  getFormClientId,
  // Sponsor form functions
  createDefaultSponsorSchema,
  getSponsorFormByEventSlug,
  getSponsorFormByEventId,
  createSponsorForm,
} from './forms.service.js';

// Schemas & Types
export {
  FieldTypeSchema,
  FieldOptionSchema,
  ConditionOperatorSchema,
  FieldConditionSchema,
  FieldValidationSchema,
  FormFieldSchema,
  FormStepSchema,
  FormSchemaJsonSchema,
  // Sponsor form schemas
  BeneficiaryTemplateSchema,
  SponsorSummarySettingsSchema,
  SponsorFormSchemaJsonSchema,
  CreateFormSchema,
  UpdateFormSchema,
  ListFormsQuerySchema,
  FormIdParamSchema,
  type FieldType,
  type FieldOption,
  type ConditionOperator,
  type FieldCondition,
  type FieldValidation,
  type FormField,
  type FormStep,
  type FormSchemaJson,
  // Sponsor form types
  type BeneficiaryTemplate,
  type SponsorSummarySettings,
  type SponsorFormSchemaJson,
  type CreateFormInput,
  type UpdateFormInput,
  type ListFormsQuery,
} from './forms.schema.js';

// Routes
export { formsRoutes } from './forms.routes.js';
export { formsPublicRoutes } from './forms.public.routes.js';
