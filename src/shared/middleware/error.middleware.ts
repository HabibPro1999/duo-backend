import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '@shared/errors/app-error.js';
import { formatZodError } from '@shared/errors/zod-error-formatter.js';
import { ErrorCodes } from '@shared/errors/error-codes.js';
import { logger } from '@shared/utils/logger.js';

export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const requestId = request.id;

  // Zod validation error
  if (error instanceof ZodError) {
    const appError = formatZodError(error);
    return reply.status(400).send({
      error: appError.message,
      code: appError.code,
      details: appError.details,
      requestId,
    });
  }

  // Known operational error
  if (error instanceof AppError) {
    logger.warn({ err: error, requestId }, error.message);
    return reply.status(error.statusCode).send({
      error: error.message,
      code: error.code,
      details: error.details,
      requestId,
    });
  }

  // Rate limit error
  if ('statusCode' in error && error.statusCode === 429) {
    return reply.status(429).send({
      error: 'Too many requests',
      code: ErrorCodes.RATE_LIMITED,
      requestId,
    });
  }

  // Unknown error
  logger.error({ err: error, requestId }, 'Unhandled error');
  return reply.status(500).send({
    error: 'Internal server error',
    code: ErrorCodes.INTERNAL_ERROR,
    requestId,
  });
}
