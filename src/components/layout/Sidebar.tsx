import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/authHooks';
import { AR, roleLabel } from '@/lib/i18n';
import { ROUTES } from '@/routes/paths';
import { useSidebarCounts } from './useSidebarCounts';
import {
  IconAlertTriangle,
  IconBox,
  IconCapsule,
  IconChat,
  IconChevronDown,
  IconDashboard,
  IconLogOut,
  IconPlus,
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
  label: string;
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
  badge?: 'newInquiries' | 'lowStock';
}

const PHARMACY_NAV: NavItem[] = [
  { to: ROUTES.dashboard, label: AR.pharmacy.sidebar.dashboard, icon: <IconDashboard /> },
  { to: ROUTES.medicines, label: AR.pharmacy.sidebar.manage_medicines, icon: <IconCapsule /> },
  {
    to: ROUTES.inventory,
    label: AR.pharmacy.sidebar.inventory,
    icon: <IconBox />,
    badge: 'lowStock',
  },
  { to: `${ROUTES.medicines}/create`, label: AR.pharmacy.sidebar.add_medicine, icon: <IconPlus /> },
  {
    to: ROUTES.inquiries,
    label: AR.pharmacy.sidebar.inquiries,
    icon: <IconChat />,
    badge: 'newInquiries',
  },
  { to: ROUTES.alternatives, label: AR.pharmacy.sidebar.manage_alternatives, icon: <IconAlertTriangle /> },
  { to: ROUTES.profile, label: AR.pharmacy.sidebar.pharmacy_profile, icon: <IconUser /> },
  { to: ROUTES.ratings, label: AR.pharmacy.sidebar.ratings, icon: <IconStar /> },
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
  const { user, logout } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const counts = useSidebarCounts();

  const initial = user?.name ? user.name.trim().charAt(0) : '؟';

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
              <h2 className="logo-title">{AR.layout.app_title}</h2>
              <span className="logo-subtitle">{AR.layout.app_subtitle}</span>
            </div>
          </div>

          {/* Pharmacy navigation */}
          <div className="nav-section">
            <div className="section-label">{AR.pharmacy.sidebar.section_title}</div>
            {PHARMACY_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={!item.activePrefix}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-text">{item.label}</span>
                {item.badge && (
                  <NavBadge count={counts[item.badge]} label={item.label} />
                )}
              </NavLink>
            ))}
          </div>

          {/* قسم المحاسبة — مطابق لـcomponents/sidebar-accounting.blade.php

              🔴 إصلاح (طلب عبود): كان مربوطًا بـ`VITE_PHARMACY_ACCOUNTING_UI`
              (افتراضيه false) فيختفي الرابط محليًا. عبود طلب إظهاره **دائمًا**
              في كل البيئات ⇒ أُزيل شرط الـflag تمامًا. المسارات كانت تعمل
              دائمًا أصلًا (الـflag كان يخفي الرابط فقط).

              ملاحظة: على الإنتاج يضبط `render.yaml` المتغيّر true عمدًا،
              فإزالة الشرط هنا توحّد السلوك في كل البيئات (لا فرق ملاحظًا). */}
          <AccountingNav />
        </div>

        {/* User profile footer */}
        <div className="user-profile-footer">
          <div className="user-info-group" title={AR.layout.edit_profile_modal_title}>
            <div className="avatar-box">{initial}</div>
            <div>
              <div className="user-name">{user?.name ?? ''}</div>
              <div className="user-role">{roleLabel(user?.role ?? '')}</div>
            </div>
          </div>
          <div
            className="more-options-btn"
            role="button"
            tabIndex={0}
            title={AR.layout.logout_tooltip}
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
            <h3>{AR.layout.logout_confirm_title}</h3>
            <p>{AR.layout.logout_confirm_message}</p>
            <div className="confirm-modal-actions">
              <button type="button" className="modal-btn" onClick={() => setShowLogoutConfirm(false)}>
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

/**
 * قسم المحاسبة في الشريط الجانبي.
 *
 * مطابق لـ`resources/views/components/sidebar-accounting.blade.php`:
 *   · حاوية `.nav-section.nav-group` بوسم `.section-label`.
 *   · زرّ طيّ `.nav-item.nav-toggle` (بأيقونة بطاقة دفع SVG كما في Blade).
 *   · `ul.nav-submenu` يحتوي:
 *       – 4 روابط فعلية (نظرة عامة · المبيعات · الإرجاعات · الصندوق)
 *       – 8 عناصر «قريبًا» **معطّلة بلا href** (لا روابط ميتة).
 *
 * Blade يفتح القسم تلقائيًا حين تكون الصفحة الحالية داخله
 * (`$isAccounting`)، ويحفظ حالة الفتح/الطيّ في localStorage تحت
 * `daway.accounting.nav.open`. نكرار السلوكين هنا.
 *
 * ⚠️ لم يعُد هناك feature flag — القسم ظاهر دائمًا (طلب عبود).
 */

/** الصفحات المبنيّة فعلًا — لها مسار حقيقي في `paths.ts`. */
const ACCOUNTING_LINKS: { to: string; label: string }[] = [
  { to: ROUTES.accounting, label: AR.accounting.sidebar.overview },
  { to: ROUTES.accountingSales, label: AR.accounting.sidebar.sales },
  { to: ROUTES.accountingRefunds, label: AR.accounting.sidebar.refunds },
  { to: ROUTES.accountingCash, label: AR.accounting.sidebar.cash_register },
];

/** الصفحات القادمة — عناصر معطّلة بوسم «قريبًا» (نفس ترتيب Blade). */
const ACCOUNTING_SOON: string[] = [
  AR.accounting.sidebar.purchases,
  AR.accounting.sidebar.expenses,
  AR.accounting.sidebar.suppliers,
  AR.accounting.sidebar.customers,
  AR.accounting.sidebar.payments,
  AR.accounting.sidebar.profit_loss,
  AR.accounting.sidebar.reports,
  AR.accounting.sidebar.settings,
];

const ACCOUNTING_NAV_STORAGE_KEY = 'daway.accounting.nav.open';

function AccountingNav() {
  const location = useLocation();

  // هل الصفحة الحالية داخل قسم المحاسبة؟ (يكافئ $isAccounting في Blade)
  const isAccounting = location.pathname.startsWith(ROUTES.accounting);

  // Blade يفتح القسم تلقائيًا داخل قسم المحاسبة، وإلا يقرأ الحالة المحفوظة.
  const [open, setOpen] = useState(() => {
    if (isAccounting) return true;
    try {
      return localStorage.getItem(ACCOUNTING_NAV_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  // عند إعادة التوجيه إلى داخل القسم، افتح القسم (لا يُغلق تلقائيًا).
  useEffect(() => {
    if (isAccounting) setOpen(true);
  }, [isAccounting]);

  function toggle() {
    setOpen((previous) => {
      try {
        localStorage.setItem(ACCOUNTING_NAV_STORAGE_KEY, previous ? '0' : '1');
      } catch {
        /* التخزين قد يكون معطّلًا — السلوك يبقى صحيحًا داخل الجلسة */
      }
      return !previous;
    });
  }

  return (
    <div className="nav-section nav-group">
      <div className="section-label">{AR.accounting.sidebar.section_title}</div>

      <button
        type="button"
        className={`nav-item nav-toggle${open ? ' is-open' : ''}`}
        aria-expanded={open}
        onClick={toggle}
      >
        <span className="nav-icon">
          {/* أيقونة بطاقة الدفع — نفس SVG المضمَّن في Blade */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <line x1="2" y1="10" x2="22" y2="10" />
            <line x1="6" y1="15" x2="10" y2="15" />
          </svg>
        </span>
        <span className="nav-text">{AR.accounting.sidebar.section_title}</span>
        <IconChevronDown className="nav-caret" />
      </button>

      <ul className="nav-submenu" hidden={!open}>
        {ACCOUNTING_LINKS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.to === ROUTES.accounting}
              className={({ isActive }) => `nav-subitem${isActive ? ' active' : ''}`}
            >
              <span className="sub-dot" aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          </li>
        ))}

        {ACCOUNTING_SOON.map((label) => (
          <li key={label}>
            {/* عنصر غير فعّال: بلا href — لا رابط ميت (مطابق لـBlade) */}
            <span className="nav-subitem" aria-disabled="true">
              <span className="sub-dot" aria-hidden="true" />
              <span>{label}</span>
              <span className="nav-soon">{AR.accounting.sidebar.soon}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
