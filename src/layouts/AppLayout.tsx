import { Outlet } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { Toaster } from '@/components/ui';
import { PushPermissionBanner } from '@/components/pharmacy/PushPermissionBanner';
import { KeepAliveOutlet } from '@/layouts/KeepAliveOutlet';

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
 *
 * ---------------------------------------------------------------------------
 * WHY THERE IS A SKIP LINK
 * ---------------------------------------------------------------------------
 * The sidebar renders 12+ links and sits BEFORE the main content in the DOM, so
 * a keyboard user has to press Tab through every one of them on every single
 * page before reaching the thing they came for. On the accounting submenu that
 * is ~20 presses. A skip link is the standard remedy and costs one element.
 *
 * Two details that make it actually work rather than merely exist:
 *
 *   · `tabIndex={-1}` on the `<main>` — without it the target is not focusable,
 *     so the browser moves the scroll position but leaves focus where it was,
 *     and the very next Tab press drops the user back at the top of the
 *     sidebar. The link would appear to do nothing.
 *   · The link is visible on focus, not permanently. A skip link that is always
 *     on screen is clutter for the 95% of users who use a mouse.
 */
export function AppLayout() {
  return (
    <>
      <div className="bg-anim-layer" aria-hidden="true" />

      <a href="#main-content" className="skip-to-content">
        تخطَّ إلى المحتوى الرئيسي
      </a>

      <div className="app-layout">
        <Sidebar />
        <div className="main-wrapper">
          <Topbar />
          <main id="main-content" className="main-content" tabIndex={-1}>
            {/* Push-permission gate lives INSIDE main so it is part of the
                focus order and never a fixed overlay covering content. It
                renders null until its usage signal is met (see the component
                and lib/pushPermission.ts). */}
            <PushPermissionBanner />
            {/* KeepAliveOutlet instead of <Outlet />: preserves the POS cart
                page (accounting/sales/create) across navigation — see
                layouts/KeepAliveOutlet.tsx. Behaves exactly like <Outlet />
                for every other route. */}
            <KeepAliveOutlet />
          </main>
        </div>
      </div>

      {/* 🔴 NO command palette — Blade parity.
          Laravel's shell has no quick-navigation dialog and no Ctrl+K binding
          (components/topbar.blade.php). This repo had added both: a `⌘K` chip in
          the topbar plus a shell-level dialog with a global key listener. The
          chip was removed first; the dialog is unmounted here so the shortcut
          cannot open a surface that does not exist in the reference design.
          The component file is kept (unmounted) rather than deleted, so the
          work is not lost if the feature is ever wanted back. */}

      {/*
        Toast stack — mounted ONCE at the shell, not per screen.
        A toast is raised from anywhere (including non-React code) and outlives
        the route that produced it, so the renderer has to sit above the router
        outlet. Its two live regions exist from first paint, which is what makes
        the first announcement reliable (see Toaster.tsx).
      */}
      <Toaster />
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
      {/* Login failures are toast-worthy action outcomes, so the stack is
          mounted here too rather than only in the authenticated shell. */}
      <Toaster />
    </div>
  );
}
