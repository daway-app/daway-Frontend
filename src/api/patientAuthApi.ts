import type { ApiClient } from './client';

/** Password-auth endpoints under review in backend PR #21. */
export const PATIENT_AUTH_ENDPOINTS = {
  register: '/api/auth/patient/register',
  login: '/api/auth/patient/login',
} as const;

export interface PatientRegistrationInput {
  name: string;
  email: string;
  phone: string;
  age: number;
  password: string;
  password_confirmation: string;
  terms_accepted: boolean;
}

export interface PatientLoginInput {
  identifier: string;
  password: string;
}

export interface PatientAuthResult {
  user: { id: number; name: string; role: 'patient' };
  token: string;
}

function readPatientResult(response: unknown): PatientAuthResult {
  if (typeof response !== 'object' || response === null) throw new Error('Invalid authentication response');
  const body = response as Record<string, unknown>;
  if (body.success !== true || typeof body.data !== 'object' || body.data === null) {
    throw new Error('Invalid authentication response');
  }
  const data = body.data as Record<string, unknown>;
  if (typeof data.token !== 'string' || data.token.length === 0 || typeof data.user !== 'object' || data.user === null) {
    throw new Error('Invalid authentication response');
  }
  const user = data.user as Record<string, unknown>;
  if (typeof user.id !== 'number' || !Number.isSafeInteger(user.id) || user.id <= 0 ||
      typeof user.name !== 'string' || user.role !== 'patient') {
    throw new Error('Invalid patient identity');
  }
  return { user: { id: user.id, name: user.name, role: 'patient' }, token: data.token };
}

/** Stateless: callers must manage a dedicated patient session, never a pharmacy session. */
export function createPatientAuthApi(client: ApiClient) {
  const options = { skipAuth: true, skipRefresh: true } as const;
  return {
    async register(input: PatientRegistrationInput): Promise<PatientAuthResult> {
      return readPatientResult(await client.post(PATIENT_AUTH_ENDPOINTS.register, input, options));
    },
    async login(input: PatientLoginInput): Promise<PatientAuthResult> {
      return readPatientResult(await client.post(PATIENT_AUTH_ENDPOINTS.login, input, options));
    },
  };
}
