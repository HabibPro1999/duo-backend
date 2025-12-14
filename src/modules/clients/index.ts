// Services
export {
  createClient,
  getClientById,
  updateClient,
  listClients,
  deleteClient,
  clientExists,
} from './clients.service.js';

// Schemas & Types
export {
  CreateClientSchema,
  UpdateClientSchema,
  ListClientsQuerySchema,
  ClientIdParamSchema,
  ClientResponseSchema,
  ClientsListResponseSchema,
  type CreateClientInput,
  type UpdateClientInput,
  type ListClientsQuery,
  type ClientResponse,
  type ClientsListResponse,
} from './clients.schema.js';

// Routes
export { clientsRoutes } from './clients.routes.js';
