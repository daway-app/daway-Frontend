import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from './client';
import { createGoogleAuthApi } from './googleAuthApi';

describe('public Google authentication', () => {
  it('requests a one-time challenge without another role session', async () => {
    const post = vi.fn().mockResolvedValue({ nonce: 'n'.repeat(64), expires_in: 300 });
    const api = createGoogleAuthApi({ post } as unknown as ApiClient);
    await expect(api.challenge('login')).resolves.toBe('n'.repeat(64));
    expect(post).toHaveBeenCalledWith('/api/auth/google/challenge', { purpose: 'login' }, { skipAuth: true, skipRefresh: true });
  });
  it('requests the intended role and rejects a mismatched identity', async () => {
    const post = vi.fn().mockResolvedValue({ success: true, data: { user: { id: 1, name: 'P', role: 'patient' }, token: 'token' } });
    const api = createGoogleAuthApi({ post } as unknown as ApiClient);
    await expect(api.login({ nonce: 'n', id_token: 'token' }, 'pharmacy')).rejects.toThrow('Invalid Google identity');
    expect(post).toHaveBeenCalledWith('/api/auth/google/login', { nonce: 'n', id_token: 'token', role: 'pharmacy' }, { skipAuth: true, skipRefresh: true });
  });
  it('accepts a valid pharmacy identity', async () => {
    const post = vi.fn().mockResolvedValue({ success: true, data: { user: { id: 1, name: 'P', role: 'pharmacy', pharmacy_id: 'PH-1', must_change_password: false }, token: 'token' } });
    const api = createGoogleAuthApi({ post } as unknown as ApiClient);
    await expect(api.login({ nonce: 'n', id_token: 'token' }, 'pharmacy')).resolves.toMatchObject({ user: { role: 'pharmacy', pharmacy_id: 'PH-1' } });
  });
});
