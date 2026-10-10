import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAdminAuth } from '@/auth/adminContext';
import { AR } from '@/lib/i18n';
import { ADMIN_ROUTES } from '@/routes/adminPaths';
import {
  IconBox,
  IconCapsule,
  IconDashboard,
  IconLogOut,
  IconUser,
} from '@/components/layout/icons';

/**
 * Admin sidebar.
 *
 * Markup reuses the PHARMACY sidebar's classes (`sidebar-pro`, `nav-section`,
 * `nav-item`, `nav-text`, `user-profile-footer`) so the existing `sidebar.css`
 * applies unchanged. Introducing new class names here would render an unstyled
 * column — the same trap the pharmacy port documented.
 *
 * The nav list comes from `resources/views/components/sidebar.blade.php`
 * (admin branch), including the "Settings" section grouping.
 */

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  /** Match nested routes as active. */
  activePrefix?: boolean;
}

const A = AR.admin.nav;

/** Management group (layout.php: management_section). */
const MANAGEMENT_NAV: NavItem[] = [
  { to: ADMIN_ROUTES.pharmacies, label: A.pharmacies, icon: <IconBox />, activePrefix: true },
  { to: ADMIN_ROUTES.medicines, label: A.medicines, icon: <IconCapsule />, activePrefix: true },
  { to: ADMIN_ROUTES.categories, label: A.categories, icon: <IconFolder />, activePrefix: true },
  { to: ADMIN_ROUTES.inventory, label: A.inventory, icon: <IconBox />, activePrefix: true },
  { to: ADMIN_ROUTES.patients, label: A.patients, icon: <IconUser />, activePrefix: true },
  { to: ADMIN_ROUTES.users, label: A.users, icon: <IconUsers />, activePrefix: true },
  {
    to: ADMIN_ROUTES.medicineRequests,
    label: A.medicine_requests,
    icon: <IconClipboard />,
    activePrefix: true,
  },
];

/** Settings group (layout.php: settings_section). */
const SETTINGS_NAV: NavItem[] = [
  { to: ADMIN_ROUTES.settings, label: A.system_settings, icon: <IconSettings />, activePrefix: true },
  { to: ADMIN_ROUTES.logs, label: A.activity_log, icon: <IconList />, activePrefix: true },
];

export function AdminSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAdminAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const initial = user?.name ? user.name.trim().charAt(0) : '؟';

  return (
    <>
      <aside className="sidebar-pro">
        <div className="sidebar-content-wrapper">
          <div className="sidebar-logo-header">
            <div className="logo-icon-box">
              <img
                src="/images/dawak-logo-256.jpg"
                alt="شعار دواك"
                className="sidebar-logo-img"
                width={64}
                height={64}
                loading="lazy"
                decoding="async"
              />
            </div>
            <div className="logo-text-group">
              <h2 className="logo-title">{A.panel_title}</h2>
              <span className="logo-subtitle">{A.panel_subtitle}</span>
            </div>
          </div>

          <div className="nav-section">
            <div className="section-label">{A.main_section}</div>
            <NavLink
              to={ADMIN_ROUTES.dashboard}
              end
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              onClick={onNavigate}
            >
              <span className="nav-icon">
                <IconDashboard />
              </span>
              <span className="nav-text">{A.dashboard}</span>
            </NavLink>
          </div>

          <div className="nav-section">
            <div className="section-label">{A.management_section}</div>
            {MANAGEMENT_NAV.map((item) => (
              <NavItemLink key={item.to} item={item} onNavigate={onNavigate} />
            ))}
          </div>

          <div className="nav-section">
            <div className="section-label">{A.settings_section}</div>
            {SETTINGS_NAV.map((item) => (
              <NavItemLink key={item.to} item={item} onNavigate={onNavigate} />
            ))}
          </div>
        </div>

        <div className="user-profile-footer">
          <div className="user-info-group">
            <div className="avatar-box">{initial}</div>
            <div>
              <div className="user-name">{user?.name ?? ''}</div>
              <div className="user-role">{user?.email ?? 'مدير'}</div>
            </div>
          </div>
          <div
            className="more-options-btn"
            role="button"
            tabIndex={0}
            title={A.logout}
            onClick={() => setShowLogoutConfirm(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setShowLogoutConfirm(true);
            }}
          >
            <IconLogOut />
          </div>
        </div>
      </aside>

      {showLogoutConfirm && (
        <div className="confirm-modal-overlay active" role="dialog" aria-modal="true">
          <div className="confirm-modal-card">
            <div className="confirm-modal-icon">!</div>
            <h3>{AR.layout.logout_confirm_title}</h3>
            <p>{AR.layout.logout_confirm_message}</p>
            <div className="confirm-modal-actions">
              <button
                type="button"
                className="modal-btn"
                onClick={() => setShowLogoutConfirm(false)}
              >
                {AR.layout.cancel_button}
              </button>
              <button
                type="button"
                className="modal-btn primary"
                onClick={() => {
                  setShowLogoutConfirm(false);
                  void logout();
                }}
              >
                {AR.layout.logout_confirm_yes}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function NavItemLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={!item.activePrefix}
      className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
      onClick={onNavigate}
    >
      <span className="nav-icon">{item.icon}</span>
      <span className="nav-text">{item.label}</span>
    </NavLink>
  );
}

/* ---------------------------------------------------------------------------
 * Local icons — the shared `icons.tsx` covers pharmacy needs. These four are
 * admin-only, so they live here rather than growing the shared file.
 * ------------------------------------------------------------------------- */

function iconProps() {
  return {
    xmlns: 'http://www.w3.org/2000/svg',
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
}

function IconFolder() {
  return (
    <svg {...iconProps()}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg {...iconProps()}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconClipboard() {
  return (
    <svg {...iconProps()}>
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg {...iconProps()}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function IconList() {
  return (
    <svg {...iconProps()}>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}
