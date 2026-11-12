import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from './client';
import { createPatientAuthApi } from './patientAuthApi';

const user = { id: 8, name: 'Patient', role: 'patient' };

describe('patient password auth client', () => {
  it('rehydrates only a valid patient identity without refreshing another session', async () => {
    const get = vi.fn().mockResolvedValue({ success: true, data: { user } });
    const api = createPatientAuthApi({ get } as unknown as ApiClient);
    await expect(api.me()).resolves.toEqual(user);
    expect(get).toHaveBeenCalledWith('/api/auth/patient/me', { skipRefresh: true });
    get.mockResolvedValue({ success: true, data: { user: { ...user, role: 'admin' } } });
    await expect(api.me()).rejects.toThrow();
  });
  it('posts credentials without attaching or refreshing an existing session', async () => {
    const post = vi.fn().mockResolvedValue({ success: true, data: { user, token: 'patient-token' } });
    const api = createPatientAuthApi({ post } as unknown as ApiClient);
    await expect(api.login({ identifier: 'patient@example.test', password: 'password' }))
      .resolves.toEqual({ user, token: 'patient-token' });
    expect(post).toHaveBeenCalledWith('/api/auth/patient/login',
      { identifier: 'patient@example.test', password: 'password' }, { skipAuth: true, skipRefresh: true });
  });

  it('submits registration fields to the dedicated endpoint', async () => {
    const post = vi.fn().mockResolvedValue({ success: true, data: { user, token: 'patient-token' } });
    const api = createPatientAuthApi({ post } as unknown as ApiClient);
    const input = { name: 'Patient', email: 'p@example.test', phone: '0591234567', age: 22,
      password: 'Password123', password_confirmation: 'Password123', terms_accepted: true };
    await expect(api.register(input)).resolves.toEqual({ user, token: 'patient-token' });
    expect(post).toHaveBeenCalledWith('/api/auth/patient/register', input, { skipAuth: true, skipRefresh: true });
  });

  it.each([
    { success: true, data: { user: { ...user, role: 'admin' }, token: 'token' } },
    { success: true, data: { user, token: '' } },
    { success: false, data: { user, token: 'token' } },
    { success: true, data: {} },
  ])('rejects malformed or non-patient identities', async (response) => {
    const post = vi.fn().mockResolvedValue(response);
    const api = createPatientAuthApi({ post } as unknown as ApiClient);
    await expect(api.login({ identifier: 'x', password: 'x' })).rejects.toThrow();
  });
});
