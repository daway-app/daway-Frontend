import type { PatientAuthResult, PatientLoginInput, PatientRegistrationInput } from '@/api/patientAuthApi';

/** An intentionally independent store; it must not write pharmacy or admin keys. */
export interface PatientTokenStore {
  get(): string | null;
  set(token: string): void;
  clear(): void;
}

export interface PatientAuthTransport {
  login(input: PatientLoginInput): Promise<PatientAuthResult>;
  register(input: PatientRegistrationInput): Promise<PatientAuthResult>;
  logout(token: string): Promise<void>;
}

export function createPatientSession(transport: PatientAuthTransport, store: PatientTokenStore) {
  return {
    getToken: () => store.get(),
    async login(input: PatientLoginInput): Promise<PatientAuthResult['user']> {
      const result = await transport.login(input);
      store.set(result.token);
      return result.user;
    },
    async register(input: PatientRegistrationInput): Promise<PatientAuthResult['user']> {
      const result = await transport.register(input);
      store.set(result.token);
      return result.user;
    },
    async logout(): Promise<void> {
      const token = store.get();
      try {
        if (token) await transport.logout(token);
      } finally {
        store.clear();
      }
    },
  };
}
