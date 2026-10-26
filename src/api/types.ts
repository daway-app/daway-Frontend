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
  /**
   * Optional payload the backend attaches to named error codes.
   *
   * Today this is the `amount_unmatched` body (HTTP 422) returned by
   * `POST /api/admin/payments/{id}/approve`, which carries `deficit|overage`
   * plus the `grand_total` it compared against. Typed as a partial so callers
   * must narrow by `code` before reading fields — this is NOT assumed on every
   * error, only on `amount_unmatched`.
   */
  data?: {
    code?: string;
    deficit?: number | string;
    overage?: number | string;
    grand_total?: number | string;
  };
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
