import type { ApiClient } from './client';

export interface EmailResetInput {
  email: string;
  token: string;
  password: string;
  password_confirmation: string;
}

/** Public recovery requests never attach or refresh a different role's session. */
export function createEmailPasswordResetApi(client: ApiClient) {
  const options = { skipAuth: true, skipRefresh: true } as const;
  return {
    request(email: string): Promise<{ message: string }> {
      return client.post('/api/auth/password/email', { email }, options);
    },
    reset(input: EmailResetInput): Promise<{ message: string }> {
      return client.post('/api/auth/password/reset', input, options);
    },
  };
}
