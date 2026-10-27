import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  useAuth,
  useNotificationsApi,
  usePharmacyApi,
  usePharmacyKeys,
} from '@/auth/authHooks';
import { roleLabel } from '@/lib/i18n';
import { useLang } from '@/lib/lang/useLang';
import { useApiQuery } from '@/api/useApiQuery';
import { PRESET_STALE_TIMES } from '@/api/queryKeys';
import type { ApiPharmacyProfile } from '@/api/pharmacyTypes';
import { thumbUrl } from '@/lib/format';
import { initTheme } from '@/lib/theme';
import { topbarTitleFor } from './routeTitles';
import { TopbarTitle } from './TopbarTitle';
import { NotificationBell } from '@/components/notifications/NotificationBell';

/**
 * Topbar — faithful port of components/topbar.blade.php.
 *
 * Markup/classes match Blade 1:1 so `topbar.css` applies unchanged:
 *   div.topbar > .topbar-title-group (title + p) + .topbar-actions
 *     a.icon-btn.lang-switch-btn > span.lang-label
 *     .notifications-wrapper > button.icon-btn#notificationBtn + .notifications-dropdown
 *     .user-profile-btn > .avatar + .user-details
 *
 * (زر تبديل الثيم حُذف — التطبيق فاتح فقط بلا دارك مود.)
 *
 * Avatar display (read-only): the pharmacy `logo_url` from the shared profile
 * query (thumbUrl 84×84), or the name's first letter when null. The backend
 * syncs `users.avatar` with the uploaded logo, so the store logo IS the
 * account picture here — matching the web profile page behaviour.
 *
 * The notification bell is backed by the real `/api/notifications` endpoints
 * through this pharmacy session's own client.
 */
export function Topbar() {
  const { user } = useAuth();
  const api = usePharmacyApi();
  const notificationsApi = useNotificationsApi();
  const keys = usePharmacyKeys();
  const { lang, STR, toggleLang } = useLang();
  const { pathname } = useLocation();
  const heading = topbarTitleFor(pathname, STR);

  // Enforce the single light theme on mount (clears any stale dark choice).
  // Skipped in the visual-QA harness, which pins the theme via the html class.
  useEffect(() => {
    if (document.body.dataset.harness === 'theme') return;
    initTheme();
  }, []);

  const initial = user?.name ? user.name.trim().charAt(0) : '؟';
  /**
   * عرض فقط: شعار الصيدلية المرفوع (thumbUrl يطبق تحويل Cloudinary)،
   * أو الحرف الأول كبديل. نفس مفتاح البروفايل المشترك — بلا طلب إضافي.
   */
  const profileQuery = useApiQuery<ApiPharmacyProfile>(
    (signal) => api.profile(signal),
    [user?.id],
    {
      queryKey: keys.profile,
      staleTime: PRESET_STALE_TIMES.settings,
    },
  );
  const logoSrc = thumbUrl(profileQuery.data?.logo_url ?? null, 84, 84);
  return (
    <div className="topbar">
      <TopbarTitle title={heading.title} subtitle={heading.subtitle} />

      <div className="topbar-actions">
        {/* Language switch — shows the OTHER locale (Blade parity):
            Arabic UI offers "EN", English UI offers "عربي". */}
        <a
          href="#"
          className="icon-btn lang-switch-btn"
          title={STR.layout.switch_language_tooltip}
          onClick={(e) => {
            e.preventDefault();
            toggleLang();
          }}
        >
          <span className="lang-label">{lang === 'ar' ? 'EN' : 'عربي'}</span>
        </a>

        <NotificationBell
          api={notificationsApi}
          queryKeys={keys.notifications}
        />

        {/* User profile — الاسم والصورة يظلان ظاهرين هنا (طلب عبود)، وزر
            الخروج مقره فوتر السايدبار أسفل. مطابق لـBlade: صورة المستخدم
            من `auth()->user()->avatar` — غير متاحة لجلسة الصيدلية بالـSPA،
            فيُعرض الحرف الأول كما يفعل Blade عندما تكون null. */}
        <div className="user-profile-btn" title={STR.layout.edit_profile_modal_title}>
          <div className="avatar">
            {logoSrc ? (
              <img
                src={logoSrc}
                alt=""
                width={36}
                height={36}
                loading="lazy"
                decoding="async"
                style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
              />
            ) : (
              initial
            )}
          </div>
          <div className="user-details">
            <span className="user-name">{user?.name ?? ''}</span>
            <span className="user-role">{roleLabel(user?.role ?? '', STR)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

