import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from './client';
import { createEmailPasswordResetApi } from './emailPasswordResetApi';

describe('email password recovery API', () => {
  it('requests a generic email response without touching another role session', async () => {
    const post = vi.fn().mockResolvedValue({ message: 'generic' });
    const api = createEmailPasswordResetApi({ post } as unknown as ApiClient);
    await expect(api.request('user@example.test')).resolves.toEqual({ message: 'generic' });
    expect(post).toHaveBeenCalledWith('/api/auth/password/email', { email: 'user@example.test' },
      { skipAuth: true, skipRefresh: true });
  });
  it('posts the reset token and confirmed password without an existing token', async () => {
    const post = vi.fn().mockResolvedValue({ message: 'done' });
    const api = createEmailPasswordResetApi({ post } as unknown as ApiClient);
    const input = { email: 'u@example.test', token: 'test-token', password: 'Password123', password_confirmation: 'Password123' };
    await api.reset(input);
    expect(post).toHaveBeenCalledWith('/api/auth/password/reset', input, { skipAuth: true, skipRefresh: true });
  });
});
