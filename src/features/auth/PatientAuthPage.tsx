import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { createApiClient } from '@/api/client';
import { createPatientAuthApi, type PatientAuthResult } from '@/api/patientAuthApi';
import { createGoogleAuthApi } from '@/api/googleAuthApi';
import { ApiError } from '@/api/errors';
import { loadGoogleIdentity } from '@/lib/googleIdentity';
import { Btn } from '@/components/ui';

// A separate patient token cannot overwrite an existing pharmacy/admin session.
const key = 'daway.patient.token';
const storage = {
  get: () => { try { return sessionStorage.getItem(key); } catch { return null; } },
  set: (token: string) => { sessionStorage.setItem(key, token); },
  clear: () => { try { sessionStorage.removeItem(key); } catch { /* already unavailable */ } },
};
const client = createApiClient({ getToken: storage.get, setToken: storage.set, clearToken: storage.clear, refresh: async () => null });
const passwordApi = createPatientAuthApi(client);
const googleApi = createGoogleAuthApi(client);
type Patient = PatientAuthResult['user'];

export function PatientAuthPage() {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(Boolean(storage.get()));
  const [register, setRegister] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [age, setAge] = useState('');
  const [terms, setTerms] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [googleReady, setGoogleReady] = useState(false);
  const button = useRef<HTMLDivElement>(null);
  const attempt = useRef(0);
  const alive = useRef(false);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? '';

  useEffect(() => {
    alive.current = true;
    if (storage.get()) {
      void passwordApi.me()
        .then((user) => { if (alive.current) setPatient(user); }).catch((e: unknown) => {
          if (e instanceof ApiError && (e.status === 401 || e.status === 403)) storage.clear();
          if (alive.current) setError('تعذر التحقق من الجلسة، حاول تسجيل الدخول مجددًا.');
        }).finally(() => { if (alive.current) setLoading(false); });
    }
    return () => { alive.current = false; attempt.current += 1; };
  }, []);

  function accept(result: PatientAuthResult) {
    storage.set(result.token);
    setPatient(result.user);
    setPassword(''); setConfirm(''); setError('');
  }
  function validProfile() {
    return name.trim() && email.trim() && /^05[6-9]\d{7}$/.test(phone) && Number(age) >= 1 && Number(age) <= 120 && terms;
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    if (register && (!validProfile() || password !== confirm)) { setError('تحقق من البيانات والموافقة وتطابق كلمتي المرور.'); return; }
    setBusy(true);
    try {
      accept(register ? await passwordApi.register({ name: name.trim(), email: email.trim(), phone, age: Number(age), terms_accepted: terms, password, password_confirmation: confirm }) : await passwordApi.login({ identifier: identifier.trim(), password }));
    } catch { setError(register ? 'تعذر إنشاء الحساب. تحقق من البيانات ومتطلبات كلمة المرور.' : 'بيانات الدخول غير صحيحة أو الحساب غير متاح.'); }
    finally { setBusy(false); }
  }
  async function prepareGoogle() {
    setError('');
    if (register && !validProfile()) { setError('أكمل الاسم والبريد ورقم الهاتف والعمر ووافق على الشروط أولاً.'); return; }
    const current = ++attempt.current;
    setBusy(true);
    try {
      await loadGoogleIdentity();
      const nonce = await googleApi.challenge(register ? 'register_patient' : 'login');
      if (!alive.current || current !== attempt.current || !button.current || !window.google?.accounts.id) return;
      setGoogleReady(true); button.current.replaceChildren();
      window.google.accounts.id.initialize({ client_id: clientId, nonce, callback: (response) => {
        if (!response.credential || !alive.current || current !== attempt.current) return;
        attempt.current += 1; setBusy(true);
        const credential = { nonce, id_token: response.credential };
        const action = register ? googleApi.registerPatient({ ...credential, name: name.trim(), email: email.trim(), phone, age: Number(age), terms_accepted: terms }) : googleApi.login(credential, 'patient');
        void action.then((result) => {
          if (!alive.current) return;
          if (result.user.role !== 'patient') throw new Error('Invalid patient');
          accept({ token: result.token, user: { id: result.user.id, name: result.user.name, role: 'patient' } });
        }).catch(() => { if (alive.current) { setError('تعذر المتابعة بـGoogle. تحقق من بياناتك وحسابك المرتبط.'); setGoogleReady(false); } })
          .finally(() => { if (alive.current) setBusy(false); });
      } });
      window.google.accounts.id.renderButton(button.current, { theme: 'outline', size: 'large', locale: 'ar' });
    } catch { if (alive.current) setError('تعذر إعداد Google. حاول مرة أخرى.'); }
    finally { if (alive.current) setBusy(false); }
  }
  async function logout() {
    setBusy(true);
    try { await client.post('/api/logout', undefined, { skipRefresh: true }); }
    catch { setError('تعذر إنهاء الجلسة على الخادم، وتم تسجيل خروجك من هذا الجهاز.'); }
    finally { storage.clear(); setPatient(null); setBusy(false); }
  }
  if (loading) return <div className="auth-container"><p role="status">جارٍ التحقق من الجلسة…</p></div>;
  if (patient) return <div className="auth-container"><div className="auth-form-side"><h1>مرحبًا {patient.name}</h1><p>تم تسجيل الدخول إلى حساب المريض.</p><Btn type="button" variant="primary" disabled={busy} onClick={() => void logout()}>تسجيل الخروج</Btn></div></div>;
  return <div className="auth-container"><div className="auth-form-side">
    <h1>{register ? 'إنشاء حساب مريض' : 'دخول المريض'}</h1>
    <form onSubmit={(e) => void submit(e)}>
      {register ? <>
        <div className="fg"><label className="fl" htmlFor="patient-name">الاسم الكامل</label><input className="fc" id="patient-name" value={name} onChange={(e) => setName(e.target.value)} required disabled={busy || googleReady} /></div>
        <div className="fg"><label className="fl" htmlFor="patient-email">البريد الإلكتروني</label><input className="fc" id="patient-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={busy || googleReady} /></div>
        <div className="fg"><label className="fl" htmlFor="patient-phone">رقم الهاتف</label><input className="fc" id="patient-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required disabled={busy || googleReady} /></div>
        <div className="fg"><label className="fl" htmlFor="patient-age">العمر</label><input className="fc" id="patient-age" type="number" min="1" max="120" value={age} onChange={(e) => setAge(e.target.value)} required disabled={busy || googleReady} /></div>
        <label><input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} required disabled={busy || googleReady} /> أوافق على الشروط والأحكام</label>
      </> : <div className="fg"><label className="fl" htmlFor="patient-id">البريد الإلكتروني أو رقم الهاتف</label><input className="fc" id="patient-id" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required disabled={busy || googleReady} /></div>}
      <div className="fg"><label className="fl" htmlFor="patient-password">كلمة المرور</label><input className="fc" id="patient-password" type={visible ? 'text' : 'password'} autoComplete={register ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} required disabled={busy || googleReady} /></div>
      {register && <><div className="fg"><label className="fl" htmlFor="patient-confirm">تأكيد كلمة المرور</label><input className="fc" id="patient-confirm" type={visible ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required disabled={busy || googleReady} /></div><p>10 أحرف على الأقل، تشمل أحرفًا كبيرة وصغيرة وأرقامًا.</p></>}
      <button type="button" onClick={() => setVisible(!visible)}>{visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}</button>
      <Btn type="submit" variant="primary" className="auth-submit" disabled={busy || googleReady}>{busy ? 'جارٍ التنفيذ…' : register ? 'إنشاء حساب' : 'دخول'}</Btn>
    </form>
    {clientId && <div className="fg">{!googleReady && <button type="button" className="ph-btn ghost" disabled={busy} onClick={() => void prepareGoogle()}>المتابعة باستخدام Google</button>}<div ref={button} />{googleReady && <button type="button" onClick={() => { attempt.current += 1; setGoogleReady(false); button.current?.replaceChildren(); }}>إلغاء</button>}</div>}
    {error && <p role="alert">{error}</p>}
    <div className="auth-footer"><button type="button" disabled={busy || googleReady} onClick={() => { setRegister(!register); setError(''); }}>{register ? 'عندي حساب' : 'إنشاء حساب مريض'}</button> · <Link to="/account-recovery">نسيت كلمة المرور؟</Link> · <Link to="/login">دخول الصيدلية أو الأدمن</Link></div>
  </div></div>;
}
