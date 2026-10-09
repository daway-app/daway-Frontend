import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/auth/authHooks';
import { CommandPaletteTrigger } from './CommandPalette';
import { AR, roleLabel } from '@/lib/i18n';
import { initTheme, toggleTheme } from '@/lib/theme';
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
 * Notifications are MOCK/static (API integration is out of scope for this
 * phase) — the dropdown renders Blade's empty-state text.
 */
export function Topbar() {
  const { user } = useAuth();
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

  return (
    <div className="topbar">
      <div className="topbar-title-group">
        <h1>{AR.topbar.dashboard_title}</h1>
        <p>{AR.topbar.dashboard_subtitle}</p>
      </div>

      <div className="topbar-actions">
        {/* Command palette trigger — a quiet, keyboard-first affordance so the
            Ctrl+K shortcut is discoverable rather than secret. */}
        <CommandPaletteTrigger />

        {/* Language switch — static label "EN" (Blade shows the other locale) */}
        <a
          href="#"
          className="icon-btn lang-switch-btn"
          title={AR.layout.switch_language_tooltip}
          onClick={(e) => e.preventDefault()}
        >
          <span className="lang-label">EN</span>
        </a>

        {/* Notifications */}
        <div className="notifications-wrapper" ref={wrapperRef}>
          <button
            className="icon-btn"
            id="notificationBtn"
            title={AR.layout.notifications_tooltip}
            onClick={() => setNotificationsOpen((v) => !v)}
          >
            <IconBell />
            <span className="notification-badge" />
          </button>
          <div className={`notifications-dropdown${notificationsOpen ? ' active' : ''}`}>
            <div className="notifications-header">
              <h3>{AR.layout.notifications_title}</h3>
              <button className="clear-all-btn">{AR.layout.mark_all_as_read}</button>
            </div>
            <div className="notifications-list">
              <p className="no-notifications">{AR.layout.no_new_notifications}</p>
            </div>
            <div className="notifications-footer">
              <a href="#" onClick={(e) => e.preventDefault()}>
                {AR.layout.view_all_notifications}
              </a>
            </div>
          </div>
        </div>

        {/* Theme toggle */}
        <button
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

        {/* User profile */}
        <div className="user-profile-btn" title={AR.layout.edit_profile_modal_title}>
          <div className="avatar">{initial}</div>
          <div className="user-details">
            <span className="user-name">{user?.name ?? ''}</span>
            <span className="user-role">{roleLabel(user?.role ?? '')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
