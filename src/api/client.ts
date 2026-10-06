import { config } from '@/config/env';
import { ApiError, apiErrorFromBody } from './errors';
import type { ApiErrorBody } from './types';

/**
 * Low-level HTTP client.
 *
 * Responsibilities:
 *  - attach `Authorization: Bearer <token>` when a token exists
 *  - always send `Accept: application/json` (engages Laravel's JSON error handlers)
 *  - parse the response envelope defensively
 *  - convert every failure into an `ApiError`
 *  - enforce a timeout
 *  - run a SINGLE-FLIGHT refresh on 401, with a SINGLE retry
 *
 * It knows nothing about React. UI reads `ApiError.kind` to decide what to render.
 */

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** JSON-serialisable request body. */
  body?: unknown;
  /** Extra headers, merged over the defaults. */
  headers?: Record<string, string>;
  /** Query string values; `undefined`/`null` entries are dropped. */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Skip attaching the Bearer token (used by the auth endpoints themselves). */
  skipAuth?: boolean;
  /** Skip the 401 refresh-and-retry path (used for refresh itself, to avoid a loop). */
  skipRefresh?: boolean;
  /** Abort signal from the caller. */
  signal?: AbortSignal;
}

/** Dependencies injected so the client stays testable and React-free. */
export interface ApiClientDeps {
  getToken: () => string | null;
  setToken: (token: string) => void;
  clearToken: () => void;
  /**
   * Performs the refresh call. Injected to avoid a circular import between the
   * client and the auth API module. Returns the new token, or `null` if the
   * refresh could not be completed (session is over).
   */
  refresh: () => Promise<string | null>;
  /** Notified when the session ends and the user must sign in again. */
  onSessionExpired?: () => void;
  /** Overridable for tests. */
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
}

function buildUrl(
  baseUrl: string,
  path: string,
  query?: RequestOptions['query'],
): string {
  const url = new URL(
    path.startsWith('http') ? path : `${baseUrl}${path}`,
  );
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

/** Parse `Retry-After` (seconds or HTTP date) into seconds. */
function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const date = Date.parse(header);
  if (!Number.isNaN(date)) {
    return Math.max(0, Math.round((date - Date.now()) / 1000));
  }
  return undefined;
}

export function createApiClient(deps: ApiClientDeps) {
  const doFetch = deps.fetchImpl ?? fetch;
  const baseUrl = (deps.baseUrl ?? config.apiBaseUrl).replace(/\/+$/, '');
  const timeoutMs = deps.timeoutMs ?? config.apiTimeoutMs;

  /**
   * Shared in-flight refresh. Every concurrent 401 awaits the same promise,
   * so N failing requests trigger ONE refresh, not N.
   */
  let refreshInFlight: Promise<string | null> | null = null;

  function runRefreshOnce(): Promise<string | null> {
    if (!refreshInFlight) {
      refreshInFlight = deps
        .refresh()
        .catch(() => null)
        .finally(() => {
          refreshInFlight = null;
        });
    }
    return refreshInFlight;
  }

  async function execute(
    path: string,
    options: RequestOptions,
    tokenOverride?: string | null,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...options.headers,
    };

    // `FormData` must NOT be JSON-encoded, and its Content-Type must be left
    // unset so the browser adds the multipart boundary itself. Setting it by
    // hand produces a body the server cannot parse.
    const isFormData =
      typeof FormData !== 'undefined' && options.body instanceof FormData;

    if (options.body !== undefined && !isFormData) {
      headers['Content-Type'] = 'application/json';
    }

    if (!options.skipAuth) {
      const token =
        tokenOverride !== undefined ? tokenOverride : deps.getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // Honour the caller's signal as well as the timeout.
    const onAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onAbort);

    try {
      return await doFetch(buildUrl(baseUrl, path, options.query), {
        method: options.method ?? 'GET',
        headers,
        body:
          options.body === undefined
            ? undefined
            : isFormData
              ? (options.body as FormData)
              : JSON.stringify(options.body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
    }
  }

  /** Turn a non-OK response into an ApiError. */
  async function toApiError(response: Response): Promise<ApiError> {
    let body: ApiErrorBody | null = null;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      // Non-JSON error body (e.g. an HTML 500 page) — leave body null.
    }
    const retryAfter = parseRetryAfter(response.headers.get('Retry-After'));
    return apiErrorFromBody(response.status, body, retryAfter);
  }

  async function request<T>(
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    let response: Response;

    try {
      response = await execute(path, options);
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === 'AbortError';
      throw new ApiError({
        kind: aborted ? 'timeout' : 'network',
        status: null,
      });
    }

    // ── 401 handling: one refresh, one retry, then give up. ──────────────
    if (
      response.status === 401 &&
      !options.skipAuth &&
      !options.skipRefresh
    ) {
      const newToken = await runRefreshOnce();

      if (newToken) {
        try {
          response = await execute(path, options, newToken);
        } catch (error) {
          const aborted =
            error instanceof DOMException && error.name === 'AbortError';
          throw new ApiError({
            kind: aborted ? 'timeout' : 'network',
            status: null,
          });
        }

        // Still 401 with a fresh token → the session is genuinely over.
        if (response.status === 401) {
          deps.clearToken();
          deps.onSessionExpired?.();
          throw await toApiError(response);
        }
      } else {
        // Refresh failed (or the chain cap was reached) → end the session.
        deps.clearToken();
        deps.onSessionExpired?.();
        throw await toApiError(response);
      }
    }

    // ── Other failures ───────────────────────────────────────────────────
    if (!response.ok) {
      if (response.status === 401 && !options.skipAuth) {
        deps.clearToken();
        deps.onSessionExpired?.();
      }
      throw await toApiError(response);
    }

    // ── Success: parse the envelope defensively. ─────────────────────────
    if (response.status === 204) {
      return undefined as T;
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ApiError({ kind: 'unknown', status: response.status });
    }

    return payload as T;
  }

  return {
    /**
     * The resolved API origin. Exposed so callers can build URLs for things the
     * JSON client cannot handle.
     */
    baseUrl,

    /**
     * Authenticated BINARY download.
     *
     * The xlsx template route sits behind `auth:sanctum` + `role:pharmacy`, so a
     * plain `<a href>` cannot be used — the browser would send no `Authorization`
     * header and the request would 401. This fetches with the token and returns
     * the body as a Blob for the caller to save.
     */
    async download(path: string): Promise<Blob> {
      const headers: Record<string, string> = { Accept: '*/*' };
      const token = deps.getToken();
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await doFetch(buildUrl(baseUrl, path), { headers });
      if (!res.ok) throw await toApiError(res);
      return res.blob();
    },

    request,

    get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
      request<T>(path, { ...options, method: 'GET' }),

    post: <T>(
      path: string,
      body?: unknown,
      options?: Omit<RequestOptions, 'method' | 'body'>,
    ) => request<T>(path, { ...options, method: 'POST', body }),

    put: <T>(
      path: string,
      body?: unknown,
      options?: Omit<RequestOptions, 'method' | 'body'>,
    ) => request<T>(path, { ...options, method: 'PUT', body }),

    patch: <T>(
      path: string,
      body?: unknown,
      options?: Omit<RequestOptions, 'method' | 'body'>,
    ) => request<T>(path, { ...options, method: 'PATCH', body }),

    delete: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
      request<T>(path, { ...options, method: 'DELETE' }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
