import { useEffect, useRef, useState } from 'react';
import { useApi, useAuth } from '@/auth/authHooks';
import { createGoogleAuthApi } from '@/api/googleAuthApi';
import { loadGoogleIdentity } from '@/lib/googleIdentity';

/** Challenge and Google login use a fresh nonce; the server checks approval. */
export function GooglePharmacySignIn() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? '';
  const api = createGoogleAuthApi(useApi().client);
  const auth = useAuth();
  const container = useRef<HTMLDivElement>(null);
  const alive = useRef(false);
  const attempt = useRef(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { alive.current = true; return () => { alive.current = false; attempt.current += 1; }; }, []);

  async function prepare() {
    if (!clientId) return;
    const current = ++attempt.current;
    setBusy(true); setError('');
    try {
      await loadGoogleIdentity();
      const nonce = await api.challenge('login');
      if (!alive.current || current !== attempt.current || !container.current || !window.google?.accounts.id) return;
      setReady(true);
      container.current.replaceChildren();
      window.google.accounts.id.initialize({ client_id: clientId, nonce, callback: (response) => {
        if (!response.credential || !alive.current || attempt.current !== current) return;
        attempt.current += 1;
        setBusy(true);
        void auth.loginWithGoogle({ nonce, id_token: response.credential })
          .catch(() => { if (alive.current) { setReady(false); setError('تعذر الدخول بـGoogle. تأكد من ربط الحساب وموافقة الإدارة.'); } })
          .finally(() => { if (alive.current) setBusy(false); });
      } });
      window.google.accounts.id.renderButton(container.current, { theme: 'outline', size: 'large', locale: 'ar' });
    } catch {
      if (alive.current) setError('تعذر إعداد الدخول بـGoogle. حاول مرة أخرى.');
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  if (!clientId) return null;
  return <div className="fg">
    {!ready && <button type="button" className="ph-btn ghost" onClick={() => void prepare()} disabled={busy}>الدخول كصيدلية باستخدام Google</button>}
    <div ref={container} />
    {ready && <button type="button" className="ph-btn ghost" disabled={busy} onClick={() => { attempt.current += 1; setReady(false); container.current?.replaceChildren(); }}>إلغاء</button>}
    {busy && <span role="status">جارٍ التنفيذ…</span>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
