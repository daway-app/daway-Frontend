import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { Toaster } from '@/components/ui';
import { AR } from '@/lib/i18n';
import { initTheme, toggleTheme } from '@/lib/theme';
import { IconMoon, IconSun } from '@/components/layout/icons';

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
              <h1>{AR.admin.nav.panel_title}</h1>
              <p>{AR.admin.nav.panel_subtitle}</p>
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

/** Bare layout for the admin login screen. */
export function AdminAuthLayout() {
  return (
    <div className="auth-shell">
      <main className="auth-shell__content">
        <Outlet />
      </main>
      <Toaster />
    </div>
  );
}
