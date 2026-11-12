type GoogleCredential = { credential?: string };
type GoogleIdentity = {
  initialize(config: { client_id: string; nonce: string; callback: (response: GoogleCredential) => void }): void;
  renderButton(element: HTMLElement, options: { theme: string; size: string; locale: string }): void;
};

declare global {
  interface Window { google?: { accounts: { id: GoogleIdentity } } }
}

let googleScript: Promise<void> | null = null;
export function loadGoogleIdentity(): Promise<void> {
  if (window.google?.accounts.id) return Promise.resolve();
  if (googleScript) return googleScript;
  googleScript = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => window.google?.accounts.id ? resolve() : reject(new Error('Google unavailable'));
    script.onerror = () => { script.remove(); reject(new Error('Google unavailable')); };
    document.head.appendChild(script);
  }).catch((error: unknown) => { googleScript = null; throw error; });
  return googleScript;
}

