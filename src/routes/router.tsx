import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout, AuthLayout } from '@/layouts/AppLayout';import { RequireAuth, RequireGuest } from './guards';
import { ROUTES } from './paths';
import { LoginPage } from '@/features/auth/LoginPage';
import { PasswordChangePage } from '@/features/auth/PasswordChangePage';
import { DashboardPage } from '@/features/pharmacy/dashboard/DashboardPage';
import { InventoryPage } from '@/features/pharmacy/inventory/InventoryPage';
import { InventoryImportPage } from '@/features/pharmacy/import/InventoryImportPage';
import { MedicinesPage } from '@/features/pharmacy/medicines/MedicinesPage';
import { MedicineRequestPage } from '@/features/pharmacy/medicines/MedicineRequestPage';
import { InquiriesPage } from '@/features/pharmacy/inquiries/InquiriesPage';
import { InquiryChatPage } from '@/features/pharmacy/inquiries/InquiryChatPage';
import { AlternativesPage } from '@/features/pharmacy/alternatives/AlternativesPage';
import { AlternativeCreatePage } from '@/features/pharmacy/alternatives/AlternativeCreatePage';
import { RatingsPage } from '@/features/pharmacy/ratings/RatingsPage';
import { ProfilePage } from '@/features/pharmacy/profile/ProfilePage';
import { ProfileCompletePage } from '@/features/pharmacy/profile/ProfileCompletePage';
import { AccountingOverviewPage } from '@/features/pharmacy/accounting/AccountingOverviewPage';
import { AccountingSalesPage } from '@/features/pharmacy/accounting/AccountingSalesPage';
import { AccountingSaleCreatePage } from '@/features/pharmacy/accounting/AccountingSaleCreatePage';
import { AccountingInvoicePage } from '@/features/pharmacy/accounting/AccountingInvoicePage';
import { AccountingRefundsPage } from '@/features/pharmacy/accounting/AccountingRefundsPage';
import { AccountingRefundCreatePage } from '@/features/pharmacy/accounting/AccountingRefundCreatePage';
import { AccountingRefundShowPage } from '@/features/pharmacy/accounting/AccountingRefundShowPage';
import { AccountingCashPage } from '@/features/pharmacy/accounting/AccountingCashPage';
import { NotFoundPage, PlaceholderPage } from '@/features/PlaceholderPage';
import { SessionExpiryWatcher } from '@/auth/SessionExpiryWatcher';

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
    element: <SessionExpiryWatcher />,
    children: [
      {
        element: <RequireGuest />,
        children: [
          {
            element: <AuthLayout />,
            children: [{ path: ROUTES.login, element: <LoginPage /> }],
          },
        ],
      },
      {
        // Password change is a FULL standalone document in Blade
        // (`auth/password-change.blade.php` has its own <html>/<body>), not a
        // child of `layouts/app.blade.php`. It therefore sits OUTSIDE AppLayout.
        // It is still an authenticated screen, so RequireAuth — not RequireGuest.
        element: <RequireAuth />,
        children: [
          {
            element: <AuthLayout />,
            children: [{ path: ROUTES.password, element: <PasswordChangePage /> }],
          },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppLayout />,
            children: [
              {
                index: true,
                element: <DashboardPage />,
              },
              {
                path: 'inventory',
                element: <InventoryPage />,
              },
              {
                path: 'inventory/import',
                element: <InventoryImportPage />,
              },
              {
                path: 'inventory/*',
                element: <PlaceholderPage title="المخزون" phase="P4" />,
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
                path: 'accounting/sales/create',
                element: <AccountingSaleCreatePage />,
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
