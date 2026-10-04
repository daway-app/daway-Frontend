import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout, AuthLayout } from '@/layouts/AppLayout';
import { RequireAuth, RequireGuest } from './guards';
import { ROUTES } from './paths';
import { LoginPage } from '@/features/auth/LoginPage';
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
        element: <RequireAuth />,
        children: [
          {
            element: <AppLayout />,
            children: [
              {
                index: true,
                element: <PlaceholderPage title="النظرة العامة" phase="P3" />,
              },
              {
                path: 'inventory/*',
                element: <PlaceholderPage title="المخزون" phase="P4" />,
              },
              {
                path: 'medicines/*',
                element: <PlaceholderPage title="الأدوية" phase="P5" />,
              },
              {
                path: 'inquiries/*',
                element: <PlaceholderPage title="الاستفسارات" phase="P6" />,
              },
              {
                path: 'alternatives/*',
                element: <PlaceholderPage title="البدائل" phase="P7" />,
              },
              {
                path: 'ratings/*',
                element: <PlaceholderPage title="التقييمات" phase="P8" />,
              },
              {
                path: 'profile/*',
                element: <PlaceholderPage title="الملف الشخصي" phase="P9" />,
              },
              {
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
