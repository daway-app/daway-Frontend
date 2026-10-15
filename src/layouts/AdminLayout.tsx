import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { Toaster } from '@/components/ui';
import { AR, roleLabel } from '@/lib/i18n';
import { initTheme, toggleTheme } from '@/lib/theme';
import { topbarTitleFor } from '@/components/layout/routeTitles';
import { IconMoon, IconSun } from '@/components/layout/icons';
import { useAdminApi, useAdminAuth } from '@/auth/adminContext';
import { useApiQuery } from '@/api/useApiQuery';
import { thumbUrl } from '@/lib/format';
import { adminKeys } from '@/api/queryKeys';
import { PRESET_STALE_TIMES } from '@/api/queryClient';
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
 *   · there is NO notification bell and NO command palette — both are bound to
 *     pharmacy data (inquiries, medicines) that an admin has no use for, and an
 *     empty dropdown is worse than none.
 *
 * The skip link keeps the same two requirements documented in AppLayout: it must
 * be first in the DOM, and its target `<main>` must carry `tabIndex={-1}` — the
 * latter is what actually moves focus rather than just the scroll position.
 */
export function AdminLayout() {
  const api = useAdminApi();
  const { user } = useAdminAuth();
  const { pathname } = useLocation();
  const heading = topbarTitleFor(pathname);

  // الاسم والصورة بالشريط العلوي (طلب عبود). الصورة من بروفايل الأدمن
  // الموجود أصلًا (`GET /api/admin/profile` → `avatar_url`) — نفس الاستدعاء
  // الذي تستخدمه صفحة الملف الشخصي، فالـcache يتشارك. عند غيابه: الحرف الأول.
  const profileQuery = useApiQuery<{ user: AdminProfile }>(
    (signal) => api.admin.profile(signal),
    [user?.id],
    {
      queryKey: adminKeys(user?.id ?? 'anon').profile,
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
        تخطَّ إلى المحتوى الرئيسي
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
            <div className="topbar-title-group">
              <h1>{heading.title}</h1>
              <p>{heading.subtitle}</p>
            </div>
            <div className="topbar-actions">
              <button
                type="button"
                className="icon-btn theme-toggle-btn"
                title={AR.layout.dark_mode_tooltip}
                onClick={() => toggleTheme()}
              >
                <span className="icon-3d sun-icon">
                  <IconSun />
                </span>
                <span className="icon-3d moon-icon">
                  <IconMoon />
                </span>
              </button>

              {/* الاسم والصورة بالشريط العلوي — زر الخروج مقره فوتر السايدبار */}
              <div className="user-profile-btn" title={AR.layout.edit_profile_modal_title}>
                <div
                  className="avatar"
                  style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined}
                >
                  {avatarUrl ? '' : initial}
                </div>
                <div className="user-details">
                  <span className="user-name">{user?.name ?? ''}</span>
                  <span className="user-role">{roleLabel(user?.role ?? '')}</span>
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
