/**
 * The Laravel API envelope, as verified from the backend source.
 *
 * IMPORTANT — the envelope is NOT uniform (verified in the backend):
 * - Success:  `{ success: true, message?: string, data: T }`
 * - Some successes omit `message`.
 * - Some errors carry `errors` (validation) instead of / in addition to `message`.
 * - Lists add a `pagination` key alongside `data`.
 *
 * We therefore model the optional parts as optional and never assume a key exists.
 */

/** Pagination meta as returned by the API (shape confirmed per-endpoint). */
export interface ApiPagination {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  from?: number | null;
  to?: number | null;
}

/** A successful response from the API. */
export interface ApiSuccess<T> {
  success: true;
  message?: string;
  data: T;
  pagination?: ApiPagination;
}

/** A validation error body (`422`). */
export interface ApiValidationError {
  message?: string;
  errors?: Record<string, string[]>;
}

/** A generic error body. */
export interface ApiErrorBody {
  success?: false;
  message?: string;
  code?: string;
  errors?: Record<string, string[]>;
}

/** HTTP status codes the client handles explicitly. */
export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  UNPROCESSABLE: 422,
  TOO_MANY_REQUESTS: 429,
  SERVER_ERROR: 500,
} as const;
