import { useEffect, useRef, useState } from 'react';
import { useApi } from '@/auth/authHooks';
import { createGooglePharmacyApi } from '@/api/googlePharmacyApi';

type GoogleCredential = { credential?: string };
type GoogleIdentity = {
  initialize(config: { client_id: string; nonce: string; callback: (response: GoogleCredential) => void }): void;
  renderButton(element: HTMLElement, options: { theme: string; size: string; locale: string }): void;
};

declare global {
  interface Window { google?: { accounts: { id: GoogleIdentity } } }
}

let googleScript: Promise<void> | null = null;
function loadGoogleIdentity(): Promise<void> {
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

/** The server binds the one-use nonce to the current pharmacy session. */
export function GoogleLinkPanel() {
  const api = createGooglePharmacyApi(useApi().client);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? '';
  const container = useRef<HTMLDivElement>(null);
  const alive = useRef(false);
  const attempt = useRef(0);
  const [password, setPassword] = useState('');
  const [nonce, setNonce] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { alive.current = true; return () => { alive.current = false; attempt.current += 1; }; }, []);

  async function prepare() {
    if (!password || !clientId) return;
    const currentAttempt = ++attempt.current;
    setBusy(true); setError(''); setMessage('');
    try {
      await loadGoogleIdentity();
      const challenge = await api.challenge();
      if (!alive.current || currentAttempt !== attempt.current || !container.current || !window.google?.accounts.id) return;
      const challengeNonce = challenge.nonce;
      setNonce(challengeNonce);
      container.current.replaceChildren();
      window.google.accounts.id.initialize({
        client_id: clientId,
        nonce: challengeNonce,
        callback: (response) => {
          if (!response.credential || !alive.current || currentAttempt !== attempt.current) return;
          attempt.current += 1;
          setBusy(true);
          void api.link({ nonce: challengeNonce, id_token: response.credential, current_password: password })
            .then(() => { if (alive.current) setMessage('تم ربط حساب Google بنجاح.'); })
            .catch(() => { if (alive.current) setError('تعذر ربط الحساب. تحقق من كلمة المرور وحاول من جديد.'); })
            .finally(() => { if (alive.current) { setBusy(false); setNonce(''); setPassword(''); } });
        },
      });
      window.google.accounts.id.renderButton(container.current, { theme: 'outline', size: 'large', locale: 'ar' });
    } catch {
      if (alive.current) setError('تعذر تحميل Google أو إعداد الربط. حاول من جديد.');
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  return <section className="ph-card" aria-labelledby="google-link-title">
    <div className="ph-card-head"><h2 id="google-link-title">ربط حساب Google</h2></div>
    <div className="ph-card-body">
      <p>اربط حساب Google الخاص بمالك الصيدلية بعد تأكيد كلمة المرور الحالية.</p>
      {!clientId ? <p role="status">ربط Google غير مهيأ حاليًا.</p> : <>
        <label htmlFor="google-link-password">كلمة المرور الحالية</label>
        <input id="google-link-password" className="ph-control" type="password" autoComplete="current-password"
          value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy || Boolean(nonce)} />
        {!nonce && <button type="button" className="ph-btn primary" onClick={() => void prepare()} disabled={busy || !password}>متابعة الربط</button>}
        <div ref={container} />
        {nonce && <button type="button" className="ph-btn ghost" onClick={() => { attempt.current += 1; setNonce(''); setPassword(''); container.current?.replaceChildren(); }} disabled={busy}>إلغاء</button>}
      </>}
      {busy && <p role="status">جارٍ التنفيذ…</p>}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  </section>;
}
