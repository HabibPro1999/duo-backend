// Services
export {
  createForm,
  getFormById,
  getFormBySlug,
  updateForm,
  listForms,
  deleteForm,
  formExists,
  getFormClientId,
} from './forms.service.js';

// Schemas & Types
export {
  MultiLangTextSchema,
  FieldTypeSchema,
  FieldOptionSchema,
  ConditionOperatorSchema,
  FieldConditionSchema,
  FieldValidationSchema,
  FormFieldSchema,
  FormStepSchema,
  FormSchemaJsonSchema,
  CreateFormSchema,
  UpdateFormSchema,
  ListFormsQuerySchema,
  FormIdParamSchema,
  FormSlugParamSchema,
  FormResponseSchema,
  FormWithRelationsResponseSchema,
  FormsListResponseSchema,
  type MultiLangText,
  type FieldType,
  type FieldOption,
  type ConditionOperator,
  type FieldCondition,
  type FieldValidation,
  type FormField,
  type FormStep,
  type FormSchemaJson,
  type CreateFormInput,
  type UpdateFormInput,
  type ListFormsQuery,
  type FormResponse,
  type FormWithRelationsResponse,
  type FormsListResponse,
} from './forms.schema.js';

// Routes
export { formsRoutes } from './forms.routes.js';
export { formsPublicRoutes } from './forms.public.routes.js';
