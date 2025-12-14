// Services
export {
  createEvent,
  getEventById,
  getEventBySlug,
  updateEvent,
  listEvents,
  deleteEvent,
  eventExists,
  incrementRegisteredCount,
  decrementRegisteredCount,
} from './events.service.js';

// Schemas & Types
export {
  CreateEventSchema,
  UpdateEventSchema,
  ListEventsQuerySchema,
  EventIdParamSchema,
  EventSlugParamSchema,
  EventResponseSchema,
  EventsListResponseSchema,
  type CreateEventInput,
  type UpdateEventInput,
  type ListEventsQuery,
  type EventResponse,
  type EventsListResponse,
} from './events.schema.js';

// Routes
export { eventsRoutes } from './events.routes.js';
