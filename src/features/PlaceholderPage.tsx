import { Link } from 'react-router-dom';
import { ROUTES } from '@/routes/paths';

/**
 * Placeholder shown for sections that are routed but not yet built.
 *
 * P0 deliberately ships NO pharmacy screens. Each section resolves to this
 * page until its phase (P3+). The route, the guard and the shell are what P0
 * proves; the content is not.
 */
export function PlaceholderPage({
  title,
  phase,
}: {
  title: string;
  phase: string;
}) {
  return (
    <section className="placeholder">
      <h1 className="placeholder__title">{title}</h1>
      <p className="placeholder__note">
        سيتم بناء هذه الشاشة في المرحلة <strong>{phase}</strong>. هذه الصفحة مجرّد
        هيكل مؤقّت للتأكد من التوجيه والحماية والتصميم العام.
      </p>
      <Link className="placeholder__link" to={ROUTES.dashboard}>
        العودة إلى النظرة العامة
      </Link>
    </section>
  );
}

/** Displayed for an unknown path. */
export function NotFoundPage() {
  return (
    <section className="placeholder">
      <h1 className="placeholder__title">الصفحة غير موجودة</h1>
      <p className="placeholder__note">الرابط الذي طلبته غير متاح.</p>
      <Link className="placeholder__link" to={ROUTES.dashboard}>
        العودة إلى النظرة العامة
      </Link>
    </section>
  );
}
