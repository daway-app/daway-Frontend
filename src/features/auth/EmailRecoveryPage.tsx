import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useApi } from '@/auth/authHooks';
import { createEmailPasswordResetApi } from '@/api/emailPasswordResetApi';
import { Btn } from '@/components/ui';

/** Email recovery is for patients, admins and riders; pharmacies use a separate flow. */
export function EmailRecoveryPage() {
  const location = useLocation();
  const api = createEmailPasswordResetApi(useApi().client);
  const isReset = location.pathname === '/reset-password';
  // The server puts the token in the fragment, which is not sent in HTTP headers.
  const [link] = useState(() => new URLSearchParams(location.hash.slice(1)));
  const [email, setEmail] = useState(() => link.get('email') ?? '');
  const [token] = useState(() => link.get('token') ?? '');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isReset && location.hash) {
      window.history.replaceState(window.history.state, '', location.pathname + location.search);
    }
  }, [isReset, location.hash, location.pathname, location.search]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (isReset && (!token || password !== confirmation)) {
      setError(!token ? 'رابط الاستعادة غير صالح.' : 'كلمتا المرور غير متطابقتين.');
      return;
    }
    setBusy(true);
    try {
      const result = isReset
        ? await api.reset({ email: email.trim(), token, password, password_confirmation: confirmation })
        : await api.request(email.trim());
      setMessage(result.message);
      setPassword('');
      setConfirmation('');
    } catch {
      setError(isReset ? 'تعذر تغيير كلمة المرور. تحقق من الرابط ومتطلبات كلمة المرور.' : 'تعذر إرسال الطلب، حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-form-side">
        <h1>{isReset ? 'تعيين كلمة مرور جديدة' : 'استعادة كلمة المرور'}</h1>
        <p>{isReset ? 'أدخل كلمة المرور الجديدة.' : 'أدخل بريدك الإلكتروني لإرسال رابط الاستعادة.'}</p>
        <p>هذا المسار للمرضى والأدمن والمندوبين. الصيدليات لها مسار استعادة منفصل.</p>
        <form onSubmit={submit}>
          <div className="fg"><label className="fl" htmlFor="recovery-email">البريد الإلكتروني</label>
            <input className="fc" id="recovery-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required disabled={busy || Boolean(message && isReset)} />
          </div>
          {isReset && <>
            <div className="fg"><label className="fl" htmlFor="recovery-password">كلمة المرور الجديدة</label>
              <input className="fc" id="recovery-password" type={visible ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} minLength={10} autoComplete="new-password" required disabled={busy || Boolean(message)} />
            </div>
            <div className="fg"><label className="fl" htmlFor="recovery-confirm">تأكيد كلمة المرور</label>
              <input className="fc" id="recovery-confirm" type={visible ? 'text' : 'password'} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} minLength={10} autoComplete="new-password" required disabled={busy || Boolean(message)} />
            </div>
            <button type="button" onClick={() => setVisible(!visible)}>{visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}</button>
            <p>10 أحرف على الأقل، وتتضمن حروفًا كبيرة وصغيرة وأرقامًا.</p>
          </>}
          {error && <div className="error-message" role="alert">{error}</div>}
          {message && <div role="status">{message}</div>}
          {!(isReset && message) && <Btn type="submit" variant="primary" className="auth-submit" disabled={busy}>{busy ? 'جارٍ التنفيذ…' : isReset ? 'تغيير كلمة المرور' : 'إرسال الرابط'}</Btn>}
        </form>
        <div className="auth-footer"><Link to="/login">العودة لتسجيل الدخول</Link></div>
      </div>
    </div>
  );
}
