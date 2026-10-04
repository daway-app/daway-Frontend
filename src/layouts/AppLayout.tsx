import { Outlet } from 'react-router-dom';

/**
 * Shell for authenticated pharmacy pages.
 *
 * P0 scope: this is the structural skeleton only — sidebar/topbar content is
 * built in P2. It exists so routing, guards and layout nesting are proven now.
 */
export function AppLayout() {
  return (
    <div className="app-shell">
      <aside className="app-shell__sidebar" aria-label="التنقّل">
        {/* P2: sidebar navigation */}
      </aside>
      <div className="app-shell__main">
        <header className="app-shell__topbar">
          {/* P2: topbar */}
        </header>
        <main className="app-shell__content">
          <Outlet />
        </main>
      </div>
    </div>
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
