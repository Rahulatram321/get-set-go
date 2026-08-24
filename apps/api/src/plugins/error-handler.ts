import type { FastifyRequest, FastifyReply } from 'fastify';
import { AppError, errorResponse } from '@orbitqueue/shared';
import { nanoid } from 'nanoid';

declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
    userId?: string;
    userEmail?: string;
    apiKeyProjectId?: string;
  }
}

export async function errorHandler(
  error: Error,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const requestId = request.requestId;

  if (error instanceof AppError) {
    return reply.status(error.statusCode).send(
      errorResponse(error.code, error.message, requestId, error.details)
    );
  }

  request.log.error({ err: error, requestId }, 'Unhandled error');

  const isDev = process.env.NODE_ENV !== 'production';
  return reply.status(500).send(
    errorResponse(
      'INTERNAL_ERROR',
      isDev ? error.message : 'An unexpected error occurred',
      requestId
    )
  );
}

export function requestIdHook(request: FastifyRequest) {
  request.requestId = (request.headers['x-request-id'] as string) ?? nanoid();
}
