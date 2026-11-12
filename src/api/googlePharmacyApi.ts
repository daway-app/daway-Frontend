import type { ApiClient } from './client';

export interface GoogleLinkInput {
  nonce: string;
  id_token: string;
  current_password: string;
}

/** Only use with the authenticated pharmacy client; the backend binds nonce to that session. */
export function createGooglePharmacyApi(client: ApiClient) {
  return {
    async challenge(): Promise<{ nonce: string; expires_in: number }> {
      const result = await client.post<{ nonce: string; expires_in: number }>('/api/pharmacy/google/challenge', undefined);
      if (typeof result.nonce !== 'string' || result.nonce.length !== 64 || result.expires_in !== 300) {
        throw new Error('Invalid Google challenge');
      }
      return result;
    },
    link(input: GoogleLinkInput): Promise<{ message: string }> {
      return client.post('/api/pharmacy/google/link', input);
    },
  };
}
