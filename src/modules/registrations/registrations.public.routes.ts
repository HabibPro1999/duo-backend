import {
  createRegistration,
  getRegistrationForEdit,
  editRegistrationPublic,
} from './registrations.service.js';
import { calculatePrice } from '@pricing';
import { getFormById } from '@forms';
import { getEventById } from '@events';
import {
  CreateRegistrationSchema,
  FormIdParamSchema,
  RegistrationIdPublicParamSchema,
  PublicEditRegistrationSchema,
  type CreateRegistrationInput,
  type PublicEditRegistrationInput,
} from './registrations.schema.js';
import { validateFormData, type FormSchema } from '@shared/utils/form-data-validator.js';
import { AppError } from '@shared/errors/app-error.js';
import { ErrorCodes } from '@shared/errors/error-codes.js';
import type { AppInstance } from '@shared/types/fastify.js';

// ============================================================================
// Public Routes (No Auth - for form submission)
// ============================================================================

export async function registrationsPublicRoutes(app: AppInstance): Promise<void> {
  // POST /api/public/forms/:formId/register - Submit registration
  app.post<{
    Params: { formId: string };
    Body: Omit<CreateRegistrationInput, 'formId'>;
  }>(
    '/:formId/register',
    {
      schema: {
        params: FormIdParamSchema,
        body: CreateRegistrationSchema.omit({ formId: true }),
      },
    },
    async (request, reply) => {
      const { formId } = request.params;
      const input: CreateRegistrationInput = { ...request.body, formId };

      // Verify form exists
      const form = await getFormById(formId);
      if (!form) {
        throw app.httpErrors.notFound('Form not found');
      }

      // Verify event is OPEN for registrations
      const event = await getEventById(form.eventId);
      if (!event || event.status !== 'OPEN') {
        throw app.httpErrors.badRequest('Event is not accepting registrations');
      }

      // Validate formData against form schema
      const validationResult = validateFormData(
        form.schema as unknown as FormSchema,
        input.formData
      );
      if (!validationResult.valid) {
        throw new AppError(
          'Form validation failed',
          400,
          true,
          ErrorCodes.FORM_VALIDATION_ERROR,
          { fieldErrors: validationResult.errors }
        );
      }

      // Calculate price breakdown using the event ID from the form
      // Convert access selections to the format expected by calculatePrice
      const selectedExtras = input.accessSelections?.map((selection) => ({
        extraId: selection.accessId,
        quantity: selection.quantity,
      })) ?? [];

      const priceBreakdown = await calculatePrice(form.eventId, {
        formData: input.formData,
        selectedExtras,
        sponsorshipCodes: input.sponsorshipCode ? [input.sponsorshipCode] : [],
      });

      // Transform price breakdown to match our schema
      // Note: calculatePrice uses 'extras' terminology, we'll adapt it
      const registrationPriceBreakdown = {
        basePrice: priceBreakdown.basePrice,
        appliedRules: priceBreakdown.appliedRules,
        calculatedBasePrice: priceBreakdown.calculatedBasePrice,
        accessItems: priceBreakdown.extras.map((extra) => ({
          accessId: extra.extraId,
          name: extra.name,
          unitPrice: extra.unitPrice,
          quantity: extra.quantity,
          subtotal: extra.subtotal,
          status: 'confirmed' as const, // Will be updated by createRegistration
        })),
        accessTotal: priceBreakdown.extrasTotal,
        subtotal: priceBreakdown.subtotal,
        sponsorships: priceBreakdown.sponsorships,
        sponsorshipTotal: priceBreakdown.sponsorshipTotal,
        total: priceBreakdown.total,
        currency: priceBreakdown.currency,
      };

      // Create registration
      const registration = await createRegistration(input, registrationPriceBreakdown);

      return reply.status(201).send({
        registration,
        priceBreakdown: registrationPriceBreakdown,
      });
    }
  );
}

// ============================================================================
// Public Registration Edit Routes (Self-Service)
// ============================================================================

export async function registrationEditPublicRoutes(app: AppInstance): Promise<void> {
  // GET /api/public/registrations/:registrationId - Get registration for editing
  app.get<{
    Params: { registrationId: string };
  }>(
    '/:registrationId',
    {
      schema: {
        params: RegistrationIdPublicParamSchema,
      },
    },
    async (request, reply) => {
      const { registrationId } = request.params;
      const result = await getRegistrationForEdit(registrationId);
      return reply.send(result);
    }
  );

  // PATCH /api/public/registrations/:registrationId - Edit registration
  app.patch<{
    Params: { registrationId: string };
    Body: PublicEditRegistrationInput;
  }>(
    '/:registrationId',
    {
      schema: {
        params: RegistrationIdPublicParamSchema,
        body: PublicEditRegistrationSchema,
      },
    },
    async (request, reply) => {
      const { registrationId } = request.params;
      const input = request.body;
      const result = await editRegistrationPublic(registrationId, input);
      return reply.send(result);
    }
  );
}
