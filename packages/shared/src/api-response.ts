import type { PaginationMeta } from './types.js';

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: PaginationMeta & Record<string, unknown>;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: unknown;
  };
}

export function successResponse<T>(
  data: T,
  meta?: Record<string, unknown>
): ApiSuccessResponse<T> {
  return { success: true, data, ...(meta ? { meta: meta as PaginationMeta & Record<string, unknown> } : {}) };
}

export function errorResponse(
  code: string,
  message: string,
  requestId?: string,
  details?: unknown
): ApiErrorResponse {
  return {
    success: false,
    error: { code, message, requestId, details },
  };
}

export function paginationMeta(page: number, limit: number, total: number): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 0,
  };
}
