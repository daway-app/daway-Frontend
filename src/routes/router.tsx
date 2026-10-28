import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout, AuthLayout } from '@/layouts/AppLayout';
import { RequireAuth, RequireGuest } from './guards';
import { ROUTES } from './paths';
import { lazyPage } from './lazyPage';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { SessionExpiryWatcher } from '@/auth/SessionExpiryWatcher';
import { DocumentTitle } from '@/components/layout/DocumentTitle';
import { ADMIN_ROUTES } from './adminPaths';
import { RequireAdmin, RedirectAdminLoginToUnified } from './adminGuards';
import { AdminLayout } from '@/layouts/AdminLayout';
import { NotFoundPage, PlaceholderPage } from '@/features/PlaceholderPage';

// ── Auth pages (eager: needed before lazy chunks load) ───────────────────────
const LoginPage = lazyPage(() => import('@/features/auth/LoginPage'));
/**
 * Public self-registration for a pharmacy. It lives in the SAME guest branch as
 * `login` because it is the counterpart of it — a signed-out visitor's screen.
 * It files an APPLICATION (`status: 'pending_approval'`), not an account, so it
 * must never sit behind `RequireAuth`.
 */
const RegisterPage = lazyPage(() => import('@/features/auth/RegisterPage'));
/**
 * Forgot-password REQUEST page. Same guest branch as its siblings: a
 * signed-out visitor's screen that FILES a review request for an admin — it
 * issues no token and resets nothing, so it must never sit behind RequireAuth.
 */
const ForgotPasswordPage = lazyPage(() => import('@/features/auth/ForgotPasswordPage'));
const PasswordChangePage = lazyPage(() => import('@/features/auth/PasswordChangePage'));

// ── Pharmacy pages (split by feature area) ───────────────────────────────────
const DashboardPage = lazyPage(() => import('@/features/pharmacy/dashboard/DashboardPage'));
const InventoryImportPage = lazyPage(() => import('@/features/pharmacy/import/InventoryImportPage'));
const MedicinesPage = lazyPage(() => import('@/features/pharmacy/medicines/MedicinesPage'));
const UncategorizedMedicinesPage = lazyPage(
  () => import('@/features/pharmacy/medicines/UncategorizedMedicinesPage'),
);
const MedicineRequestPage = lazyPage(() => import('@/features/pharmacy/medicines/MedicineRequestPage'));
const MedicineCreatePage = lazyPage(() => import('@/features/pharmacy/medicines/MedicineCreatePage'));
const MedicineEditPage = lazyPage(() => import('@/features/pharmacy/medicines/MedicineEditPage'));
const InquiriesPage = lazyPage(() => import('@/features/pharmacy/inquiries/InquiriesPage'));
const InquiryChatPage = lazyPage(() => import('@/features/pharmacy/inquiries/InquiryChatPage'));
const AlternativesPage = lazyPage(() => import('@/features/pharmacy/alternatives/AlternativesPage'));
const AlternativeCreatePage = lazyPage(() => import('@/features/pharmacy/alternatives/AlternativeCreatePage'));
const RatingsPage = lazyPage(() => import('@/features/pharmacy/ratings/RatingsPage'));
const ProfilePage = lazyPage(() => import('@/features/pharmacy/profile/ProfilePage'));
const ProfileCompletePage = lazyPage(() => import('@/features/pharmacy/profile/ProfileCompletePage'));

// ── Accounting pages ──────────────────────────────────────────────────────────
const AccountingOverviewPage = lazyPage(() => import('@/features/pharmacy/accounting/AccountingOverviewPage'));
const AccountingSalesPage = lazyPage(() => import('@/features/pharmacy/accounting/AccountingSalesPage'));
// NOTE: AccountingSaleCreatePage is NOT routed here — it is mounted by
// layouts/KeepAliveOutlet.tsx (Phase 3 keep-alive for the POS cart).
const AccountingInvoicePage = lazyPage(() => import('@/features/pharmacy/accounting/AccountingInvoicePage'));
const AccountingRefundsPage = lazyPage(() => import('@/features/pharmacy/accounting/AccountingRefundsPage'));
const AccountingRefundCreatePage = lazyPage(() => import('@/features/pharmacy/accounting/AccountingRefundCreatePage'));
const AccountingRefundShowPage = lazyPage(() => import('@/features/pharmacy/accounting/AccountingRefundShowPage'));
const AccountingCashPage = lazyPage(() => import('@/features/pharmacy/accounting/AccountingCashPage'));

// ── Admin pages ───────────────────────────────────────────────────────────────
const AdminDashboardPage = lazyPage(() => import('@/features/admin/dashboard/AdminDashboardPage'));
const AdminPharmaciesPage = lazyPage(() => import('@/features/admin/pharmacies/AdminPharmaciesPage'));
const AdminMedicinesPage = lazyPage(() => import('@/features/admin/medicines/AdminMedicinesPage'));
const AdminMedicineFormPage = lazyPage(() => import('@/features/admin/medicines/AdminMedicineFormPage'));
const AdminMedicineRequestsPage = lazyPage(() => import('@/features/admin/requests/AdminMedicineRequestsPage'));
const AdminCategoriesPage = lazyPage(() => import('@/features/admin/categories/AdminCategoriesPage'));
const AdminUsersPage = lazyPage(() => import('@/features/admin/users/AdminUsersPage'));
const AdminUserFormPage = lazyPage(() => import('@/features/admin/users/AdminUserFormPage'));
const AdminLogsPage = lazyPage(() => import('@/features/admin/logs/AdminLogsPage'));
const AdminSettingsPage = lazyPage(() => import('@/features/admin/settings/AdminSettingsPage'));
const AdminDeliveryPricingPage = lazyPage(
  () => import('@/features/admin/deliveryPricing/AdminDeliveryPricingPage'),
);
const AdminPaymentBanksPage = lazyPage(
  () => import('@/features/admin/payments/AdminPaymentBanksPage'),
);
const AdminPaymentsPage = lazyPage(() => import('@/features/admin/payments/AdminPaymentsPage'));
const AdminPaymentProblemsPage = lazyPage(
  () => import('@/features/admin/payments/AdminPaymentProblemsPage'),
);
const AdminProfilePage = lazyPage(() => import('@/features/admin/profile/AdminProfilePage'));
const AdminPasswordChangePage = lazyPage(() => import('@/features/admin/profile/AdminPasswordChangePage'));

/**
 * Pharmacy Web route table.
 *
 * Structure follows pharmacy features and user flows — not a 1:1 copy of
 * `routes/web.php`. Every section below resolves to a placeholder until its
 * phase is approved; only the shell, guards and auth are real in P0.
 */
export const router = createBrowserRouter([
  {
    // Root layout: hosts cross-cutting, router-aware behaviour. It must sit
    // inside the router tree, since it uses `useNavigate()`.
    //
    // `DocumentTitle` is a SIBLING here (not a wrapper): it needs `useLocation`
    // and `useLang`, renders nothing, and keeps the tab title in sync with the
    // route + language. It is the ONLY writer of `document.title` (Phase 1B.3).
    //
    // `errorElement` here is the LAST line of defence: without it a throw from
    // this element, from a guard, or from a top-level loader produced a blank
    // page with no message at all. Nested branches below declare their own so a
    // page crash keeps the surrounding shell mounted.
    element: (
      <>
        <DocumentTitle />
        <SessionExpiryWatcher />
      </>
    ),
    errorElement: <RouteErrorBoundary />,
    children: [
      // ──────────────────────────────────────────────────────────────────────
      // ADMIN TREE — declared FIRST, deliberately.
      //
      // The pharmacy tree below ends with a `path: '*'` catch-all inside
      // `AppLayout`/`RequireAuth`. Although React Router ranks a literal segment
      // above `*` (so `/admin/pharmacies` would win on ranking alone), relying
      // on ranking here would be fragile: if it ever resolved to the pharmacy
      // branch, an admin with no pharmacy session would be redirected to the
      // PHARMACY login — a confusing dead end that looks like a routing bug and
      // is hard to trace. Declaring the admin tree first removes the question
      // entirely, and `/admin/*` is unambiguous because no pharmacy route
      // begins with `admin`.
      //
      // NOTE: there is no admin login branch here any more. A signed-out admin
      // is handled by `RequireAdmin` below, which sends them to the unified
      // `/login` — the single login that serves both roles.
      // ──────────────────────────────────────────────────────────────────────
      // Legacy `/admin/login` — kept ONLY to bounce bookmarks and stale links
      // into the unified screen. It sits outside `RequireAdmin` because its own
      // redirect logic decides where the visitor goes (dashboard if already
      // signed in, `/login` otherwise).
      {
        path: ADMIN_ROUTES.login,
        element: <RedirectAdminLoginToUnified />,
      },
      {
        element: <RequireAdmin />,
        // Keeps the crash INSIDE the admin shell instead of replacing the whole
        // document — the admin keeps their sidebar and can navigate away.
        errorElement: <RouteErrorBoundary />,
        children: [
          {
            element: <AdminLayout />,
            errorElement: <RouteErrorBoundary />,
            children: [
              { path: ADMIN_ROUTES.dashboard, element: <AdminDashboardPage /> },
              { path: ADMIN_ROUTES.pharmacies, element: <AdminPharmaciesPage /> },
              { path: ADMIN_ROUTES.medicines, element: <AdminMedicinesPage /> },
              {
                // Literal `create` must resolve BEFORE `:id/edit`; both are
                // literals here so the ranking is unambiguous either way, but
                // keeping `create` first documents the intent.
                path: ADMIN_ROUTES.medicineCreate,
                element: <AdminMedicineFormPage mode="create" />,
              },
              {
                path: '/admin/medicines/:id/edit',
                element: <AdminMedicineFormPage mode="edit" />,
              },
              { path: ADMIN_ROUTES.medicineRequests, element: <AdminMedicineRequestsPage /> },
              { path: ADMIN_ROUTES.categories, element: <AdminCategoriesPage /> },
              { path: ADMIN_ROUTES.users, element: <AdminUsersPage /> },
              {
                path: ADMIN_ROUTES.userCreate,
                element: <AdminUserFormPage mode="create" />,
              },
              {
                path: '/admin/users/:id/edit',
                element: <AdminUserFormPage mode="edit" />,
              },
              { path: ADMIN_ROUTES.logs, element: <AdminLogsPage /> },
              { path: ADMIN_ROUTES.settings, element: <AdminSettingsPage /> },
              { path: ADMIN_ROUTES.deliveryPricing, element: <AdminDeliveryPricingPage /> },
              { path: ADMIN_ROUTES.paymentBanks, element: <AdminPaymentBanksPage /> },
              { path: ADMIN_ROUTES.payments, element: <AdminPaymentsPage /> },
              { path: ADMIN_ROUTES.paymentProblems, element: <AdminPaymentProblemsPage /> },
              { path: ADMIN_ROUTES.profile, element: <AdminProfilePage /> },
              {
                // Declared AFTER `profile` — the literal `/admin/profile/password`
                // must win over a bare `profile` match, which it does by ranking,
                // but keeping the order intuitive costs nothing and mirrors the
                // accounting `sales/create` → `sales/:number` precedent.
                path: ADMIN_ROUTES.profilePassword,
                element: <AdminPasswordChangePage />,
              },
              // Unknown admin path → the admin 404, NOT the pharmacy catch-all.
              { path: 'admin/*', element: <NotFoundPage /> },
            ],
          },
        ],
      },

      {
        element: <RequireGuest />,
        errorElement: <RouteErrorBoundary />,
        children: [
          {
            element: <AuthLayout />,
            errorElement: <RouteErrorBoundary />,
            children: [
              { path: ROUTES.login, element: <LoginPage /> },
              // Public registration. `RequireGuest` (not `RequireAuth`) on
              // purpose: an already-signed-in pharmacy has no reason to file a
              // second application, and the guard bounces it back to `/`.
              { path: ROUTES.register, element: <RegisterPage /> },
              // Public reset REQUEST — sibling of the two above, same reasoning.
              { path: ROUTES.forgotPassword, element: <ForgotPasswordPage /> },
            ],
          },
        ],
      },
      {
        // Password change is a FULL standalone document in Blade
        // (`auth/password-change.blade.php` has its own <html>/<body>), not a
        // child of `layouts/app.blade.php`. It therefore sits OUTSIDE AppLayout.
        // It is still an authenticated screen, so RequireAuth — not RequireGuest.
        element: <RequireAuth />,
        errorElement: <RouteErrorBoundary />,
        children: [
          {
            element: <AuthLayout />,
            errorElement: <RouteErrorBoundary />,
            children: [{ path: ROUTES.password, element: <PasswordChangePage /> }],
          },
        ],
      },
      {
        element: <RequireAuth />,
        errorElement: <RouteErrorBoundary />,
        children: [
          {
            element: <AppLayout />,
            errorElement: <RouteErrorBoundary />,
            children: [
              {
                index: true,
                element: <DashboardPage />,
              },
              {
                path: 'inventory/import',
                element: <InventoryImportPage />,
              },
              {
                path: 'medicines',
                element: <MedicinesPage />,
              },
              {
                path: 'medicines/request',
                element: <MedicineRequestPage />,
              },
              {
                path: 'medicines/uncategorized',
                element: <UncategorizedMedicinesPage />,
              },
              {
                path: 'medicines/create',
                element: <MedicineCreatePage />,
              },
              {
                path: 'medicines/:id/edit',
                element: <MedicineEditPage />,
              },
              {
                path: 'medicines/*',
                element: <PlaceholderPage title="الأدوية" phase="P5" />,
              },
              {
                path: 'inquiries',
                element: <InquiriesPage />,
              },
              {
                path: 'inquiries/:id/chat',
                element: <InquiryChatPage />,
              },
              {
                path: 'alternatives',
                element: <AlternativesPage />,
              },
              {
                path: 'alternatives/create',
                element: <AlternativeCreatePage />,
              },
              {
                path: 'ratings',
                element: <RatingsPage />,
              },
              {
                path: 'profile',
                element: <ProfilePage />,
              },
              {
                path: 'profile/complete',
                element: <ProfileCompletePage />,
              },
              {
                path: 'profile/*',
                element: <PlaceholderPage title="الملف الشخصي" phase="P9" />,
              },
              {
                path: 'accounting',
                element: <AccountingOverviewPage />,
              },
              {
                path: 'accounting/sales',
                element: <AccountingSalesPage />,
              },
              {
                // Declared before `accounting/sales/:number` so "create" is not
                // swallowed as an invoice number (same ordering rule as Blade).
                //
                // Phase 3 keep-alive: this route intentionally renders NULL.
                // The POS page component is mounted by `KeepAliveOutlet` (see
                // layouts/KeepAliveOutlet.tsx) so its cart state survives
                // navigation away and back. The route match still owns the URL,
                // the guards, and the topbar title — only the component mount
                // moved.
                path: 'accounting/sales/create',
                element: null,
              },
              {
                path: 'accounting/sales/:number',
                element: <AccountingInvoicePage />,
              },
              {
                path: 'accounting/refunds',
                element: <AccountingRefundsPage />,
              },
              {
                path: 'accounting/refunds/create/:saleNumber',
                element: <AccountingRefundCreatePage />,
              },
              {
                path: 'accounting/refunds/:id',
                element: <AccountingRefundShowPage />,
              },
              {
                path: 'accounting/cash',
                element: <AccountingCashPage />,
              },
              {
                // Catch-all last, so unknown accounting sub-paths still land on
                // the placeholder rather than a silent 404 inside the section.
                path: 'accounting/*',
                element: <PlaceholderPage title="المحاسبة" phase="P10" />,
              },
              { path: '404', element: <NotFoundPage /> },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
      { path: '*', element: <Navigate to={ROUTES.login} replace /> },
    ],
  },
]);
