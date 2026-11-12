import { describe, expect, it, vi } from 'vitest';
import { createPatientSession } from './patientSession';

function fixture() {
  let token: string | null = null;
  const store = { get: () => token, set: (value: string) => { token = value; }, clear: () => { token = null; } };
  const user = { id: 3, name: 'Patient', role: 'patient' as const };
  const transport = { login: vi.fn().mockResolvedValue({ user, token: 'patient-token' }),
    register: vi.fn().mockResolvedValue({ user, token: 'new-token' }), logout: vi.fn().mockResolvedValue(undefined) };
  return { session: createPatientSession(transport, store), transport, store, user };
}

describe('isolated patient session', () => {
  it('stores only the patient token after successful login', async () => {
    const { session, user } = fixture();
    await expect(session.login({ identifier: 'p@example.test', password: 'Password123' })).resolves.toEqual(user);
    expect(session.getToken()).toBe('patient-token');
  });
  it('does not write a token after a rejected login', async () => {
    const { session, transport } = fixture();
    transport.login.mockRejectedValueOnce(new Error('rejected'));
    await expect(session.login({ identifier: 'p@example.test', password: 'bad' })).rejects.toThrow();
    expect(session.getToken()).toBeNull();
  });
  it('clears the isolated session even when logout fails', async () => {
    const { session, transport } = fixture();
    await session.login({ identifier: 'p@example.test', password: 'Password123' });
    transport.logout.mockRejectedValueOnce(new Error('offline'));
    await expect(session.logout()).rejects.toThrow('offline');
    expect(transport.logout).toHaveBeenCalledWith('patient-token');
    expect(session.getToken()).toBeNull();
  });
});
