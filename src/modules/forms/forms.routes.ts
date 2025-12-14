import type { FastifyInstance } from 'fastify';
import { requireAuth } from '@shared/middleware/auth.middleware.js';
import { AppError } from '@shared/errors/app-error.js';
import { ErrorCodes } from '@shared/errors/error-codes.js';
import { getEventById } from '@events';
import {
  createForm,
  getFormById,
  listForms,
  updateForm,
  deleteForm,
  getFormClientId,
} from './forms.service.js';
import {
  CreateFormSchema,
  UpdateFormSchema,
  ListFormsQuerySchema,
  FormIdParamSchema,
} from './forms.schema.js';

const UserRole = {
  SUPER_ADMIN: 0,
  CLIENT_ADMIN: 1,
} as const;

export async function formsRoutes(app: FastifyInstance): Promise<void> {
  // All routes require authentication
  app.addHook('onRequest', requireAuth);

  // POST /api/forms - Create form
  app.post('/', async (request, reply) => {
    const input = CreateFormSchema.parse(request.body);

    // Get event to check ownership
    const event = await getEventById(input.eventId);
    if (!event) {
      throw new AppError('Event not found', 404, true, ErrorCodes.NOT_FOUND);
    }

    // Check if user is super_admin or creating form for their own client's event
    const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
    const isOwnClient = request.user!.clientId === event.clientId;

    if (!isSuperAdmin && !isOwnClient) {
      throw new AppError(
        'Insufficient permissions to create form for this event',
        403,
        true,
        ErrorCodes.FORBIDDEN
      );
    }

    const form = await createForm(input);
    return reply.status(201).send(form);
  });

  // GET /api/forms - List forms
  app.get('/', async (request, reply) => {
    const query = ListFormsQuerySchema.parse(request.query);

    // For client_admin users, filter by their client's events
    if (request.user!.role === UserRole.CLIENT_ADMIN) {
      if (!request.user!.clientId) {
        throw new AppError(
          'User is not associated with any client',
          400,
          true,
          ErrorCodes.BAD_REQUEST
        );
      }

      // If eventId is provided, verify it belongs to this client
      if (query.eventId) {
        const event = await getEventById(query.eventId);
        if (!event || event.clientId !== request.user!.clientId) {
          throw new AppError(
            'Insufficient permissions to access this event',
            403,
            true,
            ErrorCodes.FORBIDDEN
          );
        }
      }
      // If no eventId provided, we'll need to filter by client's events
      // For simplicity, we require eventId for client_admin users
      else {
        throw new AppError(
          'Event ID is required for client admin users',
          400,
          true,
          ErrorCodes.BAD_REQUEST
        );
      }
    }

    const result = await listForms(query);
    return reply.send(result);
  });

  // GET /api/forms/:id - Get form
  app.get('/:id', async (request, reply) => {
    const { id } = FormIdParamSchema.parse(request.params);

    const form = await getFormById(id);
    if (!form) {
      throw new AppError('Form not found', 404, true, ErrorCodes.NOT_FOUND);
    }

    // Check if user is super_admin or accessing their own client's form
    const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
    if (!isSuperAdmin) {
      const clientId = await getFormClientId(id);
      if (clientId !== request.user!.clientId) {
        throw new AppError(
          'Insufficient permissions to access this form',
          403,
          true,
          ErrorCodes.FORBIDDEN
        );
      }
    }

    return reply.send(form);
  });

  // PATCH /api/forms/:id - Update form
  app.patch('/:id', async (request, reply) => {
    const { id } = FormIdParamSchema.parse(request.params);
    const input = UpdateFormSchema.parse(request.body);

    // Get form to check ownership
    const form = await getFormById(id);
    if (!form) {
      throw new AppError('Form not found', 404, true, ErrorCodes.NOT_FOUND);
    }

    // Check if user is super_admin or updating their own client's form
    const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
    if (!isSuperAdmin) {
      const clientId = await getFormClientId(id);
      if (clientId !== request.user!.clientId) {
        throw new AppError(
          'Insufficient permissions to update this form',
          403,
          true,
          ErrorCodes.FORBIDDEN
        );
      }
    }

    const updatedForm = await updateForm(id, input);
    return reply.send(updatedForm);
  });

  // DELETE /api/forms/:id - Delete form
  app.delete('/:id', async (request, reply) => {
    const { id } = FormIdParamSchema.parse(request.params);

    // Get form to check ownership
    const form = await getFormById(id);
    if (!form) {
      throw new AppError('Form not found', 404, true, ErrorCodes.NOT_FOUND);
    }

    // Check if user is super_admin or deleting their own client's form
    const isSuperAdmin = request.user!.role === UserRole.SUPER_ADMIN;
    if (!isSuperAdmin) {
      const clientId = await getFormClientId(id);
      if (clientId !== request.user!.clientId) {
        throw new AppError(
          'Insufficient permissions to delete this form',
          403,
          true,
          ErrorCodes.FORBIDDEN
        );
      }
    }

    await deleteForm(id);
    return reply.status(204).send();
  });
}
