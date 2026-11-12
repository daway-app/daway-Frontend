import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '@/auth/authHooks';
import { createGoogleAuthApi } from '@/api/googleAuthApi';
import { loadGoogleIdentity } from '@/lib/googleIdentity';

/** Recovery is permitted only for a previously linked, active pharmacy. */
export function GooglePharmacyRecoveryPage() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? '';
  const api = createGoogleAuthApi(useApi().client);
  const container = useRef<HTMLDivElement>(null);
  const alive = useRef(false);
  const attempt = useRef(0);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { alive.current = true; return () => { alive.current = false; attempt.current += 1; }; }, []);

  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!clientId) { setError('استعادة Google غير مهيأة حاليًا.'); return; }
    if (password !== confirm || password.length < 10 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError('تأكد من تطابق كلمتي المرور، وأنها 10 أحرف وتتضمن أحرفًا كبيرة وصغيرة وأرقامًا.'); return;
    }
    const current = ++attempt.current;
    setBusy(true);
    try {
      await loadGoogleIdentity();
      const nonce = await api.challenge('recover_pharmacy');
      if (!alive.current || current !== attempt.current || !container.current || !window.google?.accounts.id) return;
      setReady(true);
      container.current.replaceChildren();
      window.google.accounts.id.initialize({ client_id: clientId, nonce, callback: (response) => {
        if (!response.credential || !alive.current || current !== attempt.current) return;
        attempt.current += 1;
        setBusy(true);
        void api.recoverPharmacy({ nonce, id_token: response.credential, password, password_confirmation: confirm })
          .then(() => { if (alive.current) { setDone(true); setPassword(''); setConfirm(''); } })
          .catch(() => { if (alive.current) { setReady(false); setError('تعذرت الاستعادة. استخدم حساب Google المرتبط وحاول مرة أخرى.'); } })
          .finally(() => { if (alive.current) setBusy(false); });
      } });
      window.google.accounts.id.renderButton(container.current, { theme: 'outline', size: 'large', locale: 'ar' });
    } catch {
      if (alive.current) setError('تعذر إعداد Google. حاول مرة أخرى.');
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  return <div className="auth-container"><div className="auth-form-side">
    <h1 className="form-title">استعادة حساب الصيدلية</h1>
    {done ? <p role="status">تم تغيير كلمة المرور. سجّل الدخول من جديد؛ الجلسات السابقة أُلغيت.</p> : <>
      <p>استخدم حساب Google المرتبط سابقًا بالصيدلية النشطة.</p>
      <form onSubmit={prepare}>
        <div className="fg"><label className="fl" htmlFor="pharmacy-recovery-password">كلمة المرور الجديدة</label>
          <input id="pharmacy-recovery-password" className="fc" type={visible ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy || ready} required minLength={10} />
        </div>
        <div className="fg"><label className="fl" htmlFor="pharmacy-recovery-confirm">تأكيد كلمة المرور</label>
          <input id="pharmacy-recovery-confirm" className="fc" type={visible ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={busy || ready} required minLength={10} />
        </div>
        <button type="button" onClick={() => setVisible(!visible)}>{visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}</button>
        <p>10 أحرف على الأقل، وتتضمن حروفًا كبيرة وصغيرة وأرقامًا.</p>
        {!ready && <button type="submit" className="ph-btn primary auth-submit" disabled={busy}>متابعة باستخدام Google</button>}
        <div ref={container} />
        {ready && <button type="button" className="ph-btn ghost" disabled={busy} onClick={() => { attempt.current += 1; setReady(false); container.current?.replaceChildren(); }}>إلغاء</button>}
      </form>
      {busy && <p role="status">جارٍ التنفيذ…</p>}
      {error && <p role="alert">{error}</p>}
    </>}
    <div className="auth-footer"><Link to="/login">العودة لتسجيل الدخول</Link></div>
  </div></div>;
}
