import { HttpStatus, type ApiErrorBody } from './types';

/**
 * Every API failure is surfaced as an `ApiError`, so callers never have to
 * branch on a raw `Response`. The `kind` field tells the UI what to render.
 */
export type ApiErrorKind =
  | 'unauthorized' // 401 — token missing / expired / chain cap reached
  | 'forbidden' // 403 — authenticated but not permitted
  | 'not_found' // 404 — resource missing
  | 'validation' // 422 — field errors
  | 'rate_limited' // 429 — back off and respect Retry-After
  | 'server' // 5xx — recoverable, offer retry
  | 'network' // no response at all (offline / DNS / timeout)
  | 'timeout' // request exceeded VITE_API_TIMEOUT_MS
  | 'unknown'; // anything else

export interface ApiErrorOptions {
  kind: ApiErrorKind;
  status: number | null;
  /** Server message, kept in its original language (Arabic) — never translated. */
  message?: string;
  /** Field-level validation errors, when the endpoint returned them. */
  errors?: Record<string, string[]>;
  /** Machine-readable code the backend sometimes sends (e.g. `account_inactive`). */
  code?: string;
  /** Seconds to wait, parsed from `Retry-After` on a 429/503. */
  retryAfterSeconds?: number;
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly errors?: Record<string, string[]>;
  readonly code?: string;
  readonly retryAfterSeconds?: number;

  constructor(options: ApiErrorOptions) {
    super(options.message ?? defaultMessageFor(options.kind));
    this.name = 'ApiError';
    this.kind = options.kind;
    this.status = options.status;
    this.errors = options.errors;
    this.code = options.code;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }

  /** True when retrying the same request could plausibly succeed. */
  get isRetryable(): boolean {
    return (
      this.kind === 'server' ||
      this.kind === 'network' ||
      this.kind === 'timeout' ||
      this.kind === 'rate_limited'
    );
  }
}

function defaultMessageFor(kind: ApiErrorKind): string {
  switch (kind) {
    case 'unauthorized':
      return 'يجب تسجيل الدخول';
    case 'forbidden':
      return 'ليس لديك صلاحية للوصول إلى هذا المحتوى';
    case 'not_found':
      return 'العنصر المطلوب غير موجود';
    case 'validation':
      return 'البيانات المُدخلة غير صحيحة';
    case 'rate_limited':
      return 'تم تجاوز عدد المحاولات، يرجى المحاولة بعد قليل';
    case 'server':
      return 'حدث خطأ في الخادم، يرجى المحاولة لاحقاً';
    case 'network':
      return 'تعذّر الاتصال بالخادم، تحقّق من اتصالك بالإنترنت';
    case 'timeout':
      return 'انتهت مهلة الطلب، يرجى المحاولة مرة أخرى';
    case 'unknown':
      return 'حدث خطأ غير متوقع';
  }
}

/** Map an HTTP status to the error kind the UI branches on. */
export function kindForStatus(status: number): ApiErrorKind {
  switch (status) {
    case HttpStatus.UNAUTHORIZED:
      return 'unauthorized';
    case HttpStatus.FORBIDDEN:
      return 'forbidden';
    case HttpStatus.NOT_FOUND:
      return 'not_found';
    case HttpStatus.UNPROCESSABLE:
      return 'validation';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'rate_limited';
    default:
      return status >= 500 ? 'server' : 'unknown';
  }
}

/** Build an ApiError from a parsed error body + status. */
export function apiErrorFromBody(
  status: number,
  body: ApiErrorBody | null,
  retryAfterSeconds?: number,
): ApiError {
  return new ApiError({
    kind: kindForStatus(status),
    status,
    message: body?.message,
    errors: body?.errors,
    code: body?.code,
    retryAfterSeconds,
  });
}
