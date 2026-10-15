import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth, usePharmacyApi } from '@/auth/authHooks';
import { roleLabel } from '@/lib/i18n';
import { useLang } from '@/lib/lang/LanguageContext';
import { useApiQuery } from '@/api/useApiQuery';
import { pharmacyKeys, PRESET_STALE_TIMES } from '@/api/queryKeys';
import type { ApiPharmacyProfile } from '@/api/pharmacyTypes';
import { thumbUrl } from '@/lib/format';
import { initTheme, toggleTheme } from '@/lib/theme';
import { topbarTitleFor } from './routeTitles';
import { IconBell, IconMoon, IconSun } from './icons';

/**
 * Topbar — faithful port of components/topbar.blade.php.
 *
 * Markup/classes match Blade 1:1 so `topbar.css` applies unchanged:
 *   div.topbar > .topbar-title-group (h1 + p) + .topbar-actions
 *     a.icon-btn.lang-switch-btn > span.lang-label
 *     .notifications-wrapper > button.icon-btn#notificationBtn + .notifications-dropdown
 *     button.icon-btn.theme-toggle-btn > span.icon-3d.sun-icon / .moon-icon
 *     .user-profile-btn > .avatar + .user-details
 *
 * Avatar display (read-only): the pharmacy `logo_url` from the shared profile
 * query (thumbUrl 84×84), or the name's first letter when null. The backend
 * syncs `users.avatar` with the uploaded logo, so the store logo IS the
 * account picture here — matching the web profile page behaviour.
 *
 * Notifications are MOCK/static (API integration is out of scope for this
 * phase) — the dropdown renders Blade's empty-state text.
 */
export function Topbar() {
  const { user } = useAuth();
  const api = usePharmacyApi();
  const { lang, STR, toggleLang } = useLang();
  const { pathname } = useLocation();
  const heading = topbarTitleFor(pathname, STR);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Apply the persisted theme once on mount (mirrors Blade's DOMContentLoaded).
  // Skipped in the visual-QA harness, which pins the theme via the html class.
  useEffect(() => {
    if (document.body.dataset.harness === 'theme') return;
    initTheme();
  }, []);

  // Close the notifications dropdown when clicking outside (mirrors Blade).
  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
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
      queryKey: pharmacyKeys(user?.id ?? 'anon').profile,
      staleTime: PRESET_STALE_TIMES.settings,
    },
  );
  const logoSrc = thumbUrl(profileQuery.data?.logo_url ?? null, 84, 84);
  return (
    <div className="topbar">
      <div className="topbar-title-group">
        <h1>{heading.title}</h1>
        <p>{heading.subtitle}</p>
      </div>

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

        {/* Notifications */}
        <div className="notifications-wrapper" ref={wrapperRef}>
          <button
            className="icon-btn"
            id="notificationBtn"
            title={STR.layout.notifications_tooltip}
            onClick={() => setNotificationsOpen((v) => !v)}
          >
            <IconBell />
            <span className="notification-badge" />
          </button>
          <div className={`notifications-dropdown${notificationsOpen ? ' active' : ''}`}>
            <div className="notifications-header">
              <h3>{STR.layout.notifications_title}</h3>
              <button className="clear-all-btn">{STR.layout.mark_all_as_read}</button>
            </div>
            <div className="notifications-list">
              <p className="no-notifications">{STR.layout.no_new_notifications}</p>
            </div>
            <div className="notifications-footer">
              <a href="#" onClick={(e) => e.preventDefault()}>
                {STR.layout.view_all_notifications}
              </a>
            </div>
          </div>
        </div>

        {/* Theme toggle */}
        <button
          className="icon-btn theme-toggle-btn"
          title={STR.layout.dark_mode_tooltip}
          onClick={() => toggleTheme()}
        >
          <span className="icon-3d sun-icon">
            <IconSun />
          </span>
          <span className="icon-3d moon-icon">
            <IconMoon />
          </span>
        </button>

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
