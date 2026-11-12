import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from './client';
import { createGooglePharmacyApi } from './googlePharmacyApi';

describe('authenticated pharmacy Google link API', () => {
  it('requests a session-bound challenge and submits the signed credential and current password', async () => {
    const nonce = 'n'.repeat(64);
    const post = vi.fn().mockResolvedValueOnce({ nonce, expires_in: 300 }).mockResolvedValueOnce({ message: 'ok' });
    const api = createGooglePharmacyApi({ post } as unknown as ApiClient);
    await expect(api.challenge()).resolves.toEqual({ nonce, expires_in: 300 });
    const input = { nonce, id_token: 'test-token', current_password: 'password' };
    await api.link(input);
    expect(post).toHaveBeenNthCalledWith(1, '/api/pharmacy/google/challenge', undefined);
    expect(post).toHaveBeenNthCalledWith(2, '/api/pharmacy/google/link', input);
  });
  it('rejects a malformed challenge before requesting a Google credential', async () => {
    const post = vi.fn().mockResolvedValue({ nonce: 'short', expires_in: 300 });
    const api = createGooglePharmacyApi({ post } as unknown as ApiClient);
    await expect(api.challenge()).rejects.toThrow('Invalid Google challenge');
  });
});
