import { describe, expect, it } from 'vitest';
import { readToken, readUser, TOKEN_LIFETIME } from './authContract';

/**
 * These tests lock in the VERIFIED backend contract.
 *
 * The single most dangerous assumption in this project is that login and
 * refresh return the token in the same place. They do not:
 *   login   → data.token
 *   refresh → root `token`
 * If someone "simplifies" `readToken`, these tests must fail.
 */

describe('readToken', () => {
  it('reads the token from the ROOT on a refresh response', () => {
    const payload = { success: true, token: 'refresh-token-abc' };
    expect(readToken(payload)).toBe('refresh-token-abc');
  });

  it('reads the token from data.token on a login response', () => {
    const payload = {
      success: true,
      message: 'Logged in successfully',
      data: { user: { id: 1, name: 'x' }, token: 'login-token-xyz' },
    };
    expect(readToken(payload)).toBe('login-token-xyz');
  });

  it('prefers the root token when both locations are present', () => {
    const payload = { success: true, token: 'root', data: { token: 'nested' } };
    expect(readToken(payload)).toBe('root');
  });

  it('returns null when no token exists', () => {
    expect(readToken({ success: true, data: { user: {} } })).toBeNull();
    expect(readToken({})).toBeNull();
    expect(readToken(null)).toBeNull();
    expect(readToken('not-an-object')).toBeNull();
  });

  it('ignores an empty-string token', () => {
    expect(readToken({ success: true, token: '' })).toBeNull();
    expect(readToken({ data: { token: '' } })).toBeNull();
  });
});

describe('readUser', () => {
  it('maps the login user block', () => {
    const payload = {
      data: {
        user: {
          id: 7,
          name: 'صيدلية النور',
          pharmacy_id: 'PH-001',
          role: 'pharmacy',
          must_change_password: true,
        },
        token: 't',
      },
    };

    expect(readUser(payload)).toEqual({
      id: 7,
      name: 'صيدلية النور',
      pharmacy_id: 'PH-001',
      role: 'pharmacy',
      must_change_password: true,
    });
  });

  it('returns null when the user block is missing or malformed', () => {
    expect(readUser({ data: { token: 't' } })).toBeNull();
    expect(readUser({ data: { user: { name: 'no id' } } })).toBeNull();
    expect(readUser({})).toBeNull();
  });
});

describe('TOKEN_LIFETIME', () => {
  it('mirrors the backend constants', () => {
    // SANCTUM_EXPIRATION = 10080 minutes · MAX_TOKEN_AGE_DAYS = 30
    expect(TOKEN_LIFETIME.accessTokenMinutes).toBe(10080);
    expect(TOKEN_LIFETIME.absoluteChainCapDays).toBe(30);
  });
});
