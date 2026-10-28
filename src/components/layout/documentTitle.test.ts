import { describe, expect, it } from 'vitest';
import { AR } from '@/lib/i18n';
import { EN } from '@/lib/lang/en';
import type { Strings } from '@/lib/lang/types';
import { ROUTES } from '@/routes/paths';
import { ADMIN_ROUTES } from '@/routes/adminPaths';
import { documentTitleFor, pageTitleFor } from './pageTitles';

/**
 * F3 — route-aware document titles (Phase 1B.3).
 *
 * WHAT THESE PIN
 * --------------
 * `document.title` used to be a single constant written once per language, so
 * every screen shared one tab title. These tests fix the CONTRACT of the pure
 * resolver: page name first, then the product brand, in both languages, with no
 * raw route ids and no untranslated `{placeholder}` leaking into a tab.
 *
 * WHAT THEY DO NOT COVER
 * ----------------------
 * They do not prove that `DocumentTitle` is mounted or that React re-runs the
 * effect on navigation — that needs a DOM. The mount point is covered by the
 * real-browser check reported in Phase 1B.3, and by the router wiring itself.
 */

const AR_STR: Strings = AR;
const EN_STR: Strings = EN as unknown as Strings;

const BRAND_AR = AR.admin.unified.brand_tag;
const BRAND_EN = EN.admin.unified.brand_tag;

/** `Page | Brand`, in either language. */
function expectFormat(title: string, page: string, brand: string): void {
  expect(title).toBe(`${page} | ${brand}`);
}

describe('documentTitleFor — formatting', () => {
  it('formats Arabic as "page | منصة دواك"', () => {
    expectFormat(documentTitleFor(ROUTES.login, AR_STR), AR.admin.unified.title, BRAND_AR);
  });

  it('formats English with the same separator and the EN brand', () => {
    expectFormat(
      documentTitleFor(ROUTES.login, EN_STR),
      EN.admin.unified.title,
      BRAND_EN,
    );
  });

  it('keeps the brand suffix out of `pageTitleFor` (no double suffix)', () => {
    const page = pageTitleFor(ROUTES.login, AR_STR);
    expect(page).not.toContain(' | ');
    expect(page).toBe(AR.admin.unified.title);
  });
});

describe('documentTitleFor — route coverage', () => {
  it('titles pharmacy routes from the shared route table', () => {
    expectFormat(
      documentTitleFor(ROUTES.medicines, AR_STR),
      AR.pharmacy.medicines.index.heading_page,
      BRAND_AR,
    );
    expectFormat(
      documentTitleFor(ROUTES.dashboard, AR_STR),
      AR.topbar.dashboard_title,
      BRAND_AR,
    );
    expectFormat(
      documentTitleFor('/accounting/sales', AR_STR),
      AR.accounting.sidebar.section_title,
      BRAND_AR,
    );
  });

  it('titles admin routes from the shared route table', () => {
    expectFormat(
      documentTitleFor(ADMIN_ROUTES.users, AR_STR),
      AR.admin.nav.users,
      BRAND_AR,
    );
    expectFormat(
      documentTitleFor(ADMIN_ROUTES.pharmacies, AR_STR),
      AR.admin.nav.pharmacies,
      BRAND_AR,
    );
    expectFormat(
      documentTitleFor(ADMIN_ROUTES.logs, AR_STR),
      AR.admin.nav.activity_log,
      BRAND_AR,
    );
  });

  it('titles the auth screens with their own headings', () => {
    expectFormat(documentTitleFor(ROUTES.register, AR_STR), AR.register.heading, BRAND_AR);
    expectFormat(
      documentTitleFor(ROUTES.forgotPassword, AR_STR),
      AR.forgot_password.heading,
      BRAND_AR,
    );
    expectFormat(
      documentTitleFor(ROUTES.password, AR_STR),
      AR.pharmacy.password.change.title,
      BRAND_AR,
    );
  });

  it('titles user CREATE and EDIT, and never leaks the record id', () => {
    expectFormat(
      documentTitleFor(ADMIN_ROUTES.userCreate, AR_STR),
      AR.admin.users.form.create_title,
      BRAND_AR,
    );

    const edit = documentTitleFor('/admin/users/98765/edit', AR_STR);
    expectFormat(edit, AR.admin.users.action_edit, BRAND_AR);
    expect(edit).not.toContain('98765');
  });

  it('falls back to the 404 label for unknown paths — not the dashboard', () => {
    const unknown = documentTitleFor('/this/does/not/exist', AR_STR);
    expectFormat(unknown, AR.topbar.not_found_title, BRAND_AR);

    // An unknown ADMIN sub-path must not inherit the admin dashboard title.
    const unknownAdmin = documentTitleFor('/admin/definitely-not-a-route', AR_STR);
    expectFormat(unknownAdmin, AR.topbar.not_found_title, BRAND_AR);
  });

  it('treats a trailing slash like the bare path', () => {
    expect(documentTitleFor('/login/', AR_STR)).toBe(documentTitleFor('/login', AR_STR));
  });
});

describe('documentTitleFor — language and safety', () => {
  it('changes with the language for the same path', () => {
    const ar = documentTitleFor(ROUTES.medicines, AR_STR);
    const en = documentTitleFor(ROUTES.medicines, EN_STR);

    expect(ar).not.toBe(en);
    expectFormat(en, EN.pharmacy.medicines.index.heading_page, BRAND_EN);
  });

  it('never emits an unresolved translation placeholder', () => {
    const paths = [
      ROUTES.login,
      ROUTES.register,
      ROUTES.forgotPassword,
      ROUTES.password,
      ROUTES.dashboard,
      ROUTES.medicines,
      ADMIN_ROUTES.users,
      ADMIN_ROUTES.userCreate,
      '/admin/users/42/edit',
      '/nope',
    ];

    for (const path of paths) {
      for (const STR of [AR_STR, EN_STR]) {
        const title = documentTitleFor(path, STR);
        expect(title).not.toContain('{');
        expect(title).not.toContain('}');
        expect(title.trim()).not.toBe('');
      }
    }
  });
});
