import type { ApiClient } from './client';

export type GooglePurpose = 'login' | 'register_patient' | 'register_pharmacy' | 'recover_pharmacy';
export type GoogleRole = 'patient' | 'pharmacy';
export interface GoogleCredentialInput { nonce: string; id_token: string }
export interface GoogleLoginResult { user: { id: number; name: string; role: GoogleRole; pharmacy_id?: string; must_change_password?: boolean }; token: string }
export interface GooglePharmacyRegistration extends GoogleCredentialInput {
  pharmacy_name: string; phone: string; region: string; password: string; password_confirmation: string;
}
export interface GooglePatientRegistration extends GoogleCredentialInput {
  name: string; email: string; phone: string; age: number; terms_accepted: boolean;
}

function readLogin(value: unknown, role: GoogleRole): GoogleLoginResult {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid Google login response');
  const body = value as Record<string, unknown>;
  if (body.success !== true || typeof body.data !== 'object' || body.data === null) throw new Error('Invalid Google login response');
  const data = body.data as Record<string, unknown>;
  if (typeof data.user !== 'object' || data.user === null || typeof data.token !== 'string' || !data.token) throw new Error('Invalid Google login response');
  const user = data.user as Record<string, unknown>;
  if (user.role !== role || typeof user.id !== 'number' || !Number.isSafeInteger(user.id) || user.id <= 0 || typeof user.name !== 'string') throw new Error('Invalid Google identity');
  if (role === 'pharmacy' && (typeof user.pharmacy_id !== 'string' || !user.pharmacy_id)) throw new Error('Invalid pharmacy identity');
  return { user: { id: user.id, name: user.name, role,
    ...(role === 'pharmacy' ? { pharmacy_id: user.pharmacy_id as string, must_change_password: user.must_change_password === true } : {}) }, token: data.token };
}

/** Public endpoints never attach or refresh another role's credentials. */
export function createGoogleAuthApi(client: ApiClient) {
  const publicOptions = { skipAuth: true, skipRefresh: true } as const;
  return {
    async challenge(purpose: GooglePurpose): Promise<string> {
      const response = await client.post<{ nonce: string; expires_in: number }>('/api/auth/google/challenge', { purpose }, publicOptions);
      if (typeof response.nonce !== 'string' || response.nonce.length !== 64 || response.expires_in !== 300) throw new Error('Invalid Google challenge');
      return response.nonce;
    },
    async login(input: GoogleCredentialInput, role: GoogleRole): Promise<GoogleLoginResult> {
      return readLogin(await client.post('/api/auth/google/login', { ...input, role }, publicOptions), role);
    },
    async registerPatient(input: GooglePatientRegistration): Promise<GoogleLoginResult> {
      return readLogin(await client.post('/api/auth/google/register-patient', input, publicOptions), 'patient');
    },
    registerPharmacy(input: GooglePharmacyRegistration): Promise<{ success: true; data: { pharmacy_id: string; status: 'pending_approval'; is_active: false } }> {
      return client.post('/api/auth/google/register-pharmacy', input, publicOptions);
    },
    recoverPharmacy(input: GoogleCredentialInput & { password: string; password_confirmation: string }): Promise<{ message: string }> {
      return client.post('/api/auth/google/recover-pharmacy', input, publicOptions);
    },
  };
}
