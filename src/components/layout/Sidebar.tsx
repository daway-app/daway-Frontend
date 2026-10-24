import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { preloadRoute } from '@/lib/routePreload';
import { useAuth, usePharmacyApi } from '@/auth/authHooks';
import { roleLabel } from '@/lib/i18n';
import { useLang } from '@/lib/lang/LanguageContext';
import { useApiQuery } from '@/api/useApiQuery';
import { pharmacyKeys, PRESET_STALE_TIMES } from '@/api/queryKeys';
import type { ApiPharmacyProfile } from '@/api/pharmacyTypes';
import { thumbUrl } from '@/lib/format';
import { ROUTES } from '@/routes/paths';
import { useSidebarCounts } from './useSidebarCounts';
import {
  IconAlertTriangle,
  IconCapsule,
  IconCart,
  IconCash,
  IconChat,
  IconDashboard,
  IconLogOut,
  IconPlus,
  IconReceipt,
  IconRefund,
  IconStar,
  IconUser,
} from './icons';

/**
 * Sidebar — faithful port of components/sidebar.blade.php (pharmacy branch).
 *
 * Markup/classes match the Blade output 1:1 so the existing `sidebar.css`
 * rules apply unchanged:
 *   aside.sidebar-pro > .sidebar-content-wrapper
 *     .sidebar-logo-header (.logo-icon-box > img.sidebar-logo-img, .logo-text-group)
 *     .nav-section > .section-label + a.nav-item(.active) > span.nav-icon + span.nav-text
 *   .user-profile-footer > .user-info-group + .more-options-btn
 *
 * Scope: pharmacy role only (per the migration brief — patient UI is excluded).
 */

/** Nav item descriptor — keeps the JSX declarative and easy to audit. */
interface NavItem {
  to: string;
  /** Translation key path inside `STR.pharmacy.sidebar`, resolved per render. */
  labelKey: string;
  icon: React.ReactNode;
  /** Match nested routes as active (e.g. medicines/* ). */
  activePrefix?: boolean;
  /**
   * Which sidebar count, if any, this item shows as a badge.
   *
   * The badge is the item's OWN count, not a global "notifications" number —
   * an unread-inquiry badge on the inventory link would be meaningless. An item
   * with no count simply has no badge, which is why this is optional rather
   * than defaulting to zero.
   */
  badge?: 'newInquiries';
}

const PHARMACY_NAV: NavItem[] = [
  { to: ROUTES.dashboard, labelKey: 'dashboard', icon: <IconDashboard /> },
  { to: ROUTES.medicines, labelKey: 'manage_medicines', icon: <IconCapsule /> },
  { to: `${ROUTES.medicines}/create`, labelKey: 'add_medicine', icon: <IconPlus /> },
  {
    to: ROUTES.inquiries,
    labelKey: 'inquiries',
    icon: <IconChat />,
    badge: 'newInquiries',
  },
  { to: ROUTES.alternatives, labelKey: 'manage_alternatives', icon: <IconAlertTriangle /> },
  { to: ROUTES.profile, labelKey: 'pharmacy_profile', icon: <IconUser /> },
  { to: ROUTES.ratings, labelKey: 'ratings', icon: <IconStar /> },
];

/**
 * A count pill for a nav item.
 *
 * Rendered as a `<span>` with `aria-hidden` PLUS visually-hidden text, rather
 * than a bare number: a screen reader announcing "الاستفسارات 3" reads the 3 as
 * part of the link name, which is close to useless ("الاستفسارات ثلاثة" tells
 * the user nothing without a noun). The hidden text supplies the noun.
 *
 * Caps at `99+` so a large number cannot stretch the sidebar and break the
 * layout — the exact value stops mattering at that point.
 */
function NavBadge({ count, label }: { count: number; label: string }) {
  if (!count || count <= 0) return null;
  return (
    <>
      <span className="nav-badge" aria-hidden="true">
        {count > 99 ? '99+' : count}
      </span>
      <span className="sr-only">{`${label}: ${count}`}</span>
    </>
  );
}

export function Sidebar() {
  const { STR } = useLang();
  const { user, logout } = useAuth();
  const api = usePharmacyApi();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const counts = useSidebarCounts();

  const initial = user?.name ? user.name.trim().charAt(0) : '؟';
  /**
   * عرض فقط: شعار الصيدلية المرفوع من صفحة البروفايل، أو الحرف الأول
   * كبديل. نفس مفتاح `pharmacyKeys().profile` الذي تستعمله الشاشات —
   * TanStack يوحد الطلب فلا يطلق استدعاءً إضافيًا.
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
  /** Resolve a `PHARMACY_NAV` label key against the current dictionary. */
  const navLabel = (key: string): string =>
    (STR.pharmacy.sidebar as Record<string, string>)[key] ?? key;

  return (
    <>
      <aside className="sidebar-pro">
        <div className="sidebar-content-wrapper">
          {/* Logo header */}
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
              <h2 className="logo-title">{STR.layout.app_title}</h2>
              <span className="logo-subtitle">{STR.layout.app_subtitle}</span>
            </div>
          </div>

          {/* Pharmacy navigation */}
          <div className="nav-section">
            <div className="section-label">{STR.pharmacy.sidebar.section_title}</div>
            {PHARMACY_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={!item.activePrefix}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                onMouseEnter={() => preloadRoute(item.to)}
                onFocus={() => preloadRoute(item.to)}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-text">{navLabel(item.labelKey)}</span>
                {item.badge && (
                  <NavBadge count={counts[item.badge]} label={navLabel(item.labelKey)} />
                )}
              </NavLink>
            ))}
          </div>

          {/* قسم المحاسبة — روابط مسطحة مباشرة (طلب عبود):
              بدون زر طيّ وبدون عناصر «قريبًا» — 4 روابط حقيقية فقط. */}
          <div className="nav-section">
            <div className="section-label">{STR.accounting.sidebar.section_title}</div>
            {ACCOUNTING_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === ROUTES.accounting}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                onMouseEnter={() => preloadRoute(item.to)}
                onFocus={() => preloadRoute(item.to)}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-text">
                  {(STR.accounting.sidebar as Record<string, string>)[item.labelKey] ?? item.labelKey}
                </span>
              </NavLink>
            ))}
          </div>
        </div>

        {/* Footer — الهوية على اليمين (الصورة + اسم الصيدلية + الدور)
            وزر الخروج على الشمال. جلسة الصيدلية بالـSPA لا تحمل صورة
            مستخدم، فيُعرض الحرف الأول داخل الأفاتار المتدرّج. */}
        <div className="user-profile-footer">
          <div className="user-info-group" title={STR.layout.edit_profile_modal_title}>
            <div className="avatar-box" aria-hidden="true">
              {logoSrc ? (
                <img
                  src={logoSrc}
                  alt=""
                  width={42}
                  height={42}
                  loading="lazy"
                  decoding="async"
                  style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                />
              ) : (
                initial
              )}
            </div>
            <div className="user-text">
              <div className="user-name">{user?.name ?? ''}</div>
              <div className="user-role">{roleLabel(user?.role ?? '', STR)}</div>
            </div>
          </div>
          <div
            className="more-options-btn"
            role="button"
            tabIndex={0}
            title={STR.layout.logout_tooltip}
            onClick={() => setShowLogoutConfirm(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setShowLogoutConfirm(true);
            }}
          >
            <IconLogOut />
          </div>
        </div>
      </aside>

      {/* Logout confirm modal — mirrors #logoutConfirmModal */}
      {showLogoutConfirm && (
        <div className="confirm-modal-overlay active" role="dialog" aria-modal="true">
          <div className="confirm-modal-card">
            <div className="confirm-modal-icon">!</div>
            <h3>{STR.layout.logout_confirm_title}</h3>
            <p>{STR.layout.logout_confirm_message}</p>
            <div className="confirm-modal-actions">
              <button type="button" className="modal-btn" onClick={() => setShowLogoutConfirm(false)}>
                {STR.layout.cancel_button}
              </button>
              <button
                type="button"
                className="modal-btn primary"
                onClick={() => {
                  setShowLogoutConfirm(false);
                  void logout();
                }}
              >
                {STR.layout.logout_confirm_yes}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * روابط المحاسبة المسطحة — 4 صفحات مبنيّة فعلًا لها مسار حقيقي في `paths.ts`.
 * بدون زر طيّ وبدون عناصر «قريبًا»: القسم السابق كان يعرض 12 سطرًا مقابل
 * 4 روابط حقيقية، وهو سبب أنه «مش عملي».
 */
const ACCOUNTING_NAV: { to: string; labelKey: string; icon: React.ReactNode }[] = [
  { to: ROUTES.accounting, labelKey: 'overview', icon: <IconReceipt /> },
  { to: ROUTES.accountingSales, labelKey: 'sales', icon: <IconCart /> },
  { to: ROUTES.accountingRefunds, labelKey: 'refunds', icon: <IconRefund /> },
  { to: ROUTES.accountingCash, labelKey: 'cash_register', icon: <IconCash /> },
];
