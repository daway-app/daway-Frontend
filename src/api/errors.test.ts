import { describe, expect, it } from 'vitest';
import { ApiError, apiErrorFromBody, kindForStatus } from './errors';

describe('kindForStatus', () => {
  it('maps every status the client handles explicitly', () => {
    expect(kindForStatus(401)).toBe('unauthorized');
    expect(kindForStatus(403)).toBe('forbidden');
    expect(kindForStatus(404)).toBe('not_found');
    expect(kindForStatus(422)).toBe('validation');
    expect(kindForStatus(429)).toBe('rate_limited');
    expect(kindForStatus(500)).toBe('server');
    expect(kindForStatus(503)).toBe('server');
  });

  it('falls back to unknown for unmapped statuses', () => {
    expect(kindForStatus(418)).toBe('unknown');
    expect(kindForStatus(302)).toBe('unknown');
  });
});

describe('apiErrorFromBody', () => {
  it('keeps the server message untranslated', () => {
    const error = apiErrorFromBody(401, { message: 'يجب تسجيل الدخول' });
    expect(error.message).toBe('يجب تسجيل الدخول');
    expect(error.kind).toBe('unauthorized');
    expect(error.status).toBe(401);
  });

  it('carries validation errors and the machine code', () => {
    const error = apiErrorFromBody(422, {
      message: 'البيانات غير صحيحة',
      errors: { pharmacy_id: ['مطلوب'] },
    });
    expect(error.errors).toEqual({ pharmacy_id: ['مطلوب'] });

    const inactive = apiErrorFromBody(403, {
      message: 'Account is inactive',
      code: 'account_inactive',
    });
    expect(inactive.code).toBe('account_inactive');
  });

  it('falls back to an Arabic default when the body has no message', () => {
    const error = apiErrorFromBody(500, null);
    expect(error.message).toBe('حدث خطأ في الخادم، يرجى المحاولة لاحقاً');
    expect(error.kind).toBe('server');
  });

  it('preserves Retry-After for rate limiting', () => {
    const error = apiErrorFromBody(429, null, 30);
    expect(error.retryAfterSeconds).toBe(30);
    expect(error.kind).toBe('rate_limited');
  });
});

describe('ApiError.isRetryable', () => {
  it('marks transient failures retryable and client errors terminal', () => {
    expect(new ApiError({ kind: 'server', status: 500 }).isRetryable).toBe(true);
    expect(new ApiError({ kind: 'network', status: null }).isRetryable).toBe(true);
    expect(new ApiError({ kind: 'timeout', status: null }).isRetryable).toBe(true);
    expect(new ApiError({ kind: 'rate_limited', status: 429 }).isRetryable).toBe(true);

    expect(new ApiError({ kind: 'unauthorized', status: 401 }).isRetryable).toBe(false);
    expect(new ApiError({ kind: 'forbidden', status: 403 }).isRetryable).toBe(false);
    expect(new ApiError({ kind: 'validation', status: 422 }).isRetryable).toBe(false);
  });
});
