import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { Toaster } from '@/components/ui';
import { roleLabel } from '@/lib/i18n';
import { useLang } from '@/lib/lang/useLang';
import { initTheme } from '@/lib/theme';
import { topbarTitleFor } from '@/components/layout/routeTitles';
import { TopbarTitle } from '@/components/layout/TopbarTitle';
import { useAdminApi, useAdminAuth, useAdminKeys } from '@/auth/adminContext';
import { useApiQuery } from '@/api/useApiQuery';
import { thumbUrl } from '@/lib/format';
import { PRESET_STALE_TIMES } from '@/api/queryClient';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import type { AdminProfile } from '@/api/adminTypes';

/**
 * Admin shell.
 *
 * Structurally identical to the pharmacy `AppLayout` (same wrappers:
 * `.bg-anim-layer`, `.app-layout`, `.main-wrapper`, `main.main-content`, plus
 * the skip link) so the existing layout CSS applies. The differences are
 * deliberate and few:
 *
 *   · the sidebar shows ADMIN navigation;
 *   · the topbar shows the panel name, not a pharmacy dashboard title;
 *   · the notification bell uses the admin session's own token and cache keys;
 *   · there is NO command palette — it is bound to pharmacy routes.
 *
 * The skip link keeps the same two requirements documented in AppLayout: it must
 * be first in the DOM, and its target `<main>` must carry `tabIndex={-1}` — the
 * latter is what actually moves focus rather than just the scroll position.
 */
export function AdminLayout() {
  const { STR, lang } = useLang();
  const api = useAdminApi();
  const keys = useAdminKeys();
  const { user } = useAdminAuth();
  const { pathname } = useLocation();
  const heading = topbarTitleFor(pathname, STR);

  // الاسم والصورة بالشريط العلوي (طلب عبود). الصورة من بروفايل الأدمن
  // الموجود أصلًا (`GET /api/admin/profile` → `avatar_url`) — نفس الاستدعاء
  // الذي تستخدمه صفحة الملف الشخصي، فالـcache يتشارك. عند غيابه: الحرف الأول.
  const profileQuery = useApiQuery<{ user: AdminProfile }>(
    (signal) => api.admin.profile(signal),
    [user?.id],
    {
      queryKey: keys.profile,
      staleTime: PRESET_STALE_TIMES.settings,
      isEmpty: () => false,
    },
  );
  // مطابق لـBlade: thumbUrl(avatar, 84, 84) كخلفية دائرية لـ`.avatar`.
  const avatarUrl = thumbUrl(profileQuery.data?.user?.avatar_url ?? null, 84, 84);
  const initial = user?.name ? user.name.trim().charAt(0) : '؟';

  useEffect(() => {
    if (document.body.dataset.harness === 'theme') return;
    initTheme();
  }, []);

  return (
    <>
      <div className="bg-anim-layer" aria-hidden="true" />

      <a href="#admin-main-content" className="skip-to-content">
        {lang === 'ar' ? 'تخطَّ إلى المحتوى الرئيسي' : 'Skip to main content'}
      </a>

      <div className="app-layout">
        {/*
          `onNavigate` fires on every sidebar link press. The pharmacy shell uses
          it to close a mobile drawer it owns; the admin sidebar has no drawer —
          it collapses via CSS at narrow widths — so this is a no-op kept only so
          the sidebar's prop contract stays identical across both shells. No
          `useLocation` subscription is needed here for the same reason.
        */}
        <AdminSidebar onNavigate={() => undefined} />

        <div className="main-wrapper">
          <div className="topbar">
            <TopbarTitle title={heading.title} subtitle={heading.subtitle} />
            <div className="topbar-actions">
              <NotificationBell
                api={api.notifications}
                queryKeys={keys.notifications}
                buttonId="adminNotificationBtn"
              />

              {/* الاسم والصورة بالشريط العلوي — زر الخروج مقره فوتر السايدبار */}
              <div className="user-profile-btn" title={STR.layout.edit_profile_modal_title}>
                <div
                  className="avatar"
                  style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined}
                >
                  {avatarUrl ? '' : initial}
                </div>
                <div className="user-details">
                  <span className="user-name">{user?.name ?? ''}</span>
                  <span className="user-role">{roleLabel(user?.role ?? '', STR)}</span>
                </div>
              </div>
            </div>
          </div>

          <main id="admin-main-content" className="main-content" tabIndex={-1}>
            <Outlet />
          </main>
        </div>
      </div>

      {/* Toasts are mounted once at the shell, same reasoning as AppLayout:
          a toast outlives the route that raised it. */}
      <Toaster />
    </>
  );
}

