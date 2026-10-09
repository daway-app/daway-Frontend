import { useEffect, useState } from 'react';
import { AR } from '@/lib/i18n';
import {
  dismissPushBanner,
  shouldShowPushBanner,
} from '@/lib/pushPermission';

/**
 * Push-permission banner (item #70).
 *
 * Shown only once the app has a real reason to ask — see
 * `lib/pushPermission.ts` for the exact signal (inquiries seen + N page views).
 *
 * HARD RULES this component obeys:
 *  · It NEVER calls `Notification.requestPermission()` on mount — only from the
 *    user's explicit click on the enable button.
 *  · It is dismissible and does NOT return after dismissal (localStorage).
 *  · If permission is `denied`, it renders nothing at all, ever.
 *  · It does not trap focus, does not cover content (it is a top-of-content
 *    strip, not a modal), and stays quiet — no motion beyond a fade-in.
 *
 * ---------------------------------------------------------------------------
 * HONEST SCOPE — the subscription step
 * ---------------------------------------------------------------------------
 * Requesting permission is only half of push. Actually delivering a push needs
 * the device to be subscribed and that subscription/token sent to the backend.
 * The Daway backend does NOT expose a Web Push subscription endpoint. It uses
 * Firebase Cloud Messaging: `POST /api/device-tokens` stores an FCM token
 * (see daway-backend/routes/api.php:156). Sending an FCM token is NOT the same
 * as a Web Push subscription — it needs the Firebase SDK, a VAPID/web config,
 * and a `firebase-messaging-sw.js`, none of which this repo has.
 *
 * So this component does NOT fake a subscription. It requests the browser
 * permission (a real, useful step), then shows an honest confirmation. Wiring
 * the token to the backend is a deliberate, documented GAP — the `TODO` below
 * marks exactly where it belongs. No POST is made to an endpoint that does not
 * exist.
 */
export function PushPermissionBanner() {
  const [visible, setVisible] = useState(false);
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    // `'Notification' in window` is required: the API is absent on insecure
    // origins (plain http, not localhost) and in some embedded webviews.
    if (!('Notification' in window)) return;
    if (shouldShowPushBanner(Notification.permission)) {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const t = AR.push_banner;

  const onEnable = () => {
    // The ONLY place the prompt is requested — a user gesture, never on mount.
    void Notification.requestPermission().then((permission) => {
      // Whether granted or denied, stop showing the banner: a denied permission
      // is permanent, and a granted one has nothing left to ask.
      dismissPushBanner();
      if (permission === 'granted') {
        setGranted(true);
        // TODO(push): send the real subscription/token to the backend here.
        // Blocked — no Web Push endpoint exists; the backend stores FCM tokens
        // via POST /api/device-tokens, which requires the Firebase SDK. Until
        // that is wired, we deliberately do not POST anywhere.
      } else {
        setVisible(false);
      }
    });
  };

  const onDismiss = () => {
    dismissPushBanner();
    setVisible(false);
  };

  return (
    <div className="push-banner" role="region" aria-label={t.title}>
      <i className="push-banner__icon fa-solid fa-bell" aria-hidden="true" />
      <div className="push-banner__text">
        <p className="push-banner__title">{t.title}</p>
        <p className="push-banner__body">{granted ? t.granted : t.body}</p>
      </div>
      <div className="push-banner__actions">
        {!granted && (
          <button type="button" className="ph-btn sm primary" onClick={onEnable}>
            {t.allow}
          </button>
        )}
        <button type="button" className="ph-btn sm ghost" onClick={onDismiss}>
          {t.dismiss}
        </button>
      </div>
    </div>
  );
}
