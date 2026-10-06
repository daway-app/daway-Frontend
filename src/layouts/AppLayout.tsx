import { Outlet } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';

/**
 * Authenticated pharmacy shell.
 *
 * Structure mirrors the Blade layout (layouts/app.blade.php):
 *   .bg-anim-layer
 *   .app-layout
 *     aside.sidebar-pro
 *     .main-wrapper
 *       .topbar
 *       main.main-content  (breadcrumb + outlet)
 */
export function AppLayout() {
  return (
    <>
      <div className="bg-anim-layer" aria-hidden="true" />
      <div className="app-layout">
        <Sidebar />
        <div className="main-wrapper">
          <Topbar />
          <main className="main-content">
            <Outlet />
          </main>
        </div>
      </div>
    </>
  );
}

/** Bare layout for public pages (login). */
export function AuthLayout() {
  return (
    <div className="auth-shell">
      <main className="auth-shell__content">
        <Outlet />
      </main>
    </div>
  );
}
