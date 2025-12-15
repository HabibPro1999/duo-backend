import { prisma } from '@/database/client.js';
import { AppError } from '@shared/errors/app-error.js';
import { ErrorCodes } from '@shared/errors/error-codes.js';
import { clientExists } from '@clients';
import { paginate, getSkip, type PaginatedResult } from '@shared/utils/pagination.js';
import type { CreateEventInput, UpdateEventInput, ListEventsQuery } from './events.schema.js';
import type { Event, Prisma } from '@prisma/client';

/**
 * Create a new event.
 */
export async function createEvent(input: CreateEventInput): Promise<Event> {
  const { clientId, name, slug, description, maxCapacity, startDate, endDate, location, status } =
    input;

  // Validate that client exists
  const isValidClient = await clientExists(clientId);
  if (!isValidClient) {
    throw new AppError('Client not found', 404, true, ErrorCodes.NOT_FOUND);
  }

  // Check if slug already exists globally
  const existing = await prisma.event.findUnique({
    where: { slug },
  });
  if (existing) {
    throw new AppError(
      'Event with this slug already exists',
      409,
      true,
      ErrorCodes.CONFLICT
    );
  }

  return prisma.event.create({
    data: {
      clientId,
      name,
      slug,
      description: description ?? null,
      maxCapacity: maxCapacity ?? null,
      startDate,
      endDate,
      location: location ?? null,
      status: status ?? 'DRAFT',
    },
  });
}

/**
 * Get event by ID.
 */
export async function getEventById(id: string): Promise<Event | null> {
  return prisma.event.findUnique({ where: { id } });
}

/**
 * Get event by slug (for public access).
 */
export async function getEventBySlug(slug: string): Promise<Event | null> {
  return prisma.event.findUnique({
    where: { slug },
  });
}

/**
 * Update event.
 */
export async function updateEvent(id: string, input: UpdateEventInput): Promise<Event> {
  // Check if event exists
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) {
    throw new AppError('Event not found', 404, true, ErrorCodes.NOT_FOUND);
  }

  // If slug is being updated, check global uniqueness
  if (input.slug && input.slug !== event.slug) {
    const existing = await prisma.event.findUnique({
      where: { slug: input.slug },
    });
    if (existing) {
      throw new AppError(
        'Event with this slug already exists',
        409,
        true,
        ErrorCodes.CONFLICT
      );
    }
  }

  return prisma.event.update({
    where: { id },
    data: input,
  });
}

/**
 * List events with pagination and filters.
 */
export async function listEvents(query: ListEventsQuery): Promise<PaginatedResult<Event>> {
  const { page, limit, clientId, status, search } = query;
  const skip = getSkip({ page, limit });

  const where: Prisma.EventWhereInput = {};

  if (clientId) where.clientId = clientId;
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { slug: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { location: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.event.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.event.count({ where }),
  ]);

  return paginate(data, total, { page, limit });
}

/**
 * Delete event.
 */
export async function deleteEvent(id: string): Promise<void> {
  // Check if event exists
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) {
    throw new AppError('Event not found', 404, true, ErrorCodes.NOT_FOUND);
  }

  await prisma.event.delete({ where: { id } });
}

/**
 * Helper function to check if event exists (for validation in other modules).
 */
export async function eventExists(id: string): Promise<boolean> {
  const count = await prisma.event.count({ where: { id } });
  return count > 0;
}

/**
 * Increment registered count for an event.
 */
export async function incrementRegisteredCount(id: string): Promise<Event> {
  return prisma.event.update({
    where: { id },
    data: { registeredCount: { increment: 1 } },
  });
}

/**
 * Decrement registered count for an event.
 */
export async function decrementRegisteredCount(id: string): Promise<Event> {
  return prisma.event.update({
    where: { id },
    data: { registeredCount: { decrement: 1 } },
  });
}
