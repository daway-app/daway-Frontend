/**
 * Heading-structure regression tests.
 *
 * THE DEFECT THESE PIN
 * --------------------
 * `Topbar` and `AdminLayout` both rendered `<h1>{heading.title}</h1>` — one
 * heading for the whole shell, mounted once and never unmounted. Every page
 * then rendered its own primary heading too (`<PageHeader>` → `<h1>`, or a
 * literal `<h1>`), so 36 authenticated pages exposed TWO level-1 headings: the
 * first described the SECTION ("المستخدمون" / "Users"), the second described the
 * page. A screen-reader user navigating by heading hit a duplicate before
 * reaching the actual page title.
 *
 * The fix: the topbar became a plain `<div class="topbar-title">`, and the two
 * screens that had no heading of their own promoted their title to `<h1>`.
 *
 * WHY THESE TESTS RENDER INSTEAD OF GREPPING
 * ------------------------------------------
 * A test that searched the source for `<h1` would prove nothing about what the
 * browser receives — and would have "passed" on the broken code, because the
 * broken markup also contained `<h1`. `renderToStaticMarkup` produces the real
 * HTML string from the real components, so the assertions below describe
 * observable output.
 *
 * LIMITATION (stated honestly, not worked around)
 * -----------------------------------------------
 * This suite runs in `environment: 'node'` with no DOM and no jsdom installed,
 * so only PURE components can be rendered: `PageHeader` (no hooks) and
 * `TopbarTitle` (no hooks). The full `Topbar`, `AdminLayout`, `AdminUserFormPage`
 * and `ProfileCompletePage` pull in auth context, TanStack Query and the router,
 * and cannot be mounted here without adding dependencies this phase forbids.
 * Those four were verified in a real browser instead — see `harness/headings.html`.
 */
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PageHeader } from '@/components/ui';
import { TopbarTitle } from '@/components/layout/TopbarTitle';
import { topbarTitleFor } from '@/components/layout/routeTitles';
import { ADMIN_ROUTES } from '@/routes/adminPaths';
import { AR } from '@/lib/i18n';
import { EN } from '@/lib/lang/en';

/** Counts `<h1>` opening tags in a rendered HTML string. */
function countH1(html: string): number {
  return (html.match(/<h1[\s>]/g) ?? []).length;
}

/** Extracts the text inside the first `<h1>`. */
function firstH1Text(html: string): string {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  return m ? m[1].replace(/<[^>]+>/g, '').trim() : '';
}

describe('TopbarTitle — must NOT be a heading', () => {
  it('renders no <h1> at all', () => {
    const html = renderToStaticMarkup(
      createElement(TopbarTitle, { title: 'المستخدمون', subtitle: 'لوحة الإدارة' }),
    );
    expect(countH1(html)).toBe(0);
  });

  it('renders no heading of any level', () => {
    // A demoted-to-<h2> title would still compete in the outline; the topbar is
    // a location label, so it must be outside the heading hierarchy entirely.
    const html = renderToStaticMarkup(
      createElement(TopbarTitle, { title: 'Users', subtitle: 'Admin panel' }),
    );
    expect(/<h[1-6][\s>]/.test(html)).toBe(false);
  });

  it('keeps the visible title and subtitle text', () => {
    const html = renderToStaticMarkup(
      createElement(TopbarTitle, { title: 'إدارة المستخدمين', subtitle: 'لوحة الإدارة' }),
    );
    expect(html).toContain('إدارة المستخدمين');
    expect(html).toContain('لوحة الإدارة');
  });

  it('keeps the class the CSS selectors were repointed at', () => {
    // `.topbar-title-group .topbar-title` replaced `.topbar-title-group h1` in
    // topbar.css and sidebar.css. If this class ever changes, the title loses
    // its font-size/weight and the ellipsis rule — a silent visual regression.
    const html = renderToStaticMarkup(
      createElement(TopbarTitle, { title: 'x', subtitle: 'y' }),
    );
    expect(html).toContain('class="topbar-title-group"');
    expect(html).toContain('class="topbar-title"');
  });
});

describe('PageHeader — the page owns exactly one <h1>', () => {
  it('renders exactly one <h1>', () => {
    const html = renderToStaticMarkup(createElement(PageHeader, { title: 'لوحة التحكم' }));
    expect(countH1(html)).toBe(1);
    expect(firstH1Text(html)).toBe('لوحة التحكم');
  });

  it('renders one <h1> with a subtitle present', () => {
    const html = renderToStaticMarkup(
      createElement(PageHeader, { title: 'المستخدمون', subtitle: 'إدارة الحسابات' }),
    );
    expect(countH1(html)).toBe(1);
  });

  it('renders one <h1> in the icon-chip variant', () => {
    // A separate markup branch — the heading must survive it too.
    const html = renderToStaticMarkup(
      createElement(PageHeader, {
        title: 'البدائل',
        iconChip: createElement('svg', null),
      }),
    );
    expect(countH1(html)).toBe(1);
    expect(firstH1Text(html)).toBe('البدائل');
  });

  it('renders the title it is GIVEN, not a hardcoded one', () => {
    // The previous version of this test rendered one title and asserted it came
    // back — which an implementation with a hardcoded string would also pass if
    // the prop happened to match. Two renders that must DIFFER is the only way
    // to prove the prop is actually used.
    const a = renderToStaticMarkup(createElement(PageHeader, { title: 'أدوية غير مصنّفة' }));
    const b = renderToStaticMarkup(createElement(PageHeader, { title: 'المستخدمون' }));

    expect(firstH1Text(a)).toBe('أدوية غير مصنّفة');
    expect(firstH1Text(b)).toBe('المستخدمون');
    expect(firstH1Text(a)).not.toBe(firstH1Text(b));
  });
});

describe('composed shell — topbar + page heading = exactly ONE <h1>', () => {
  /**
   * This is the actual regression. Each half is correct on its own; the bug was
   * that they coexisted. Composing them the way a real page does is the only
   * assertion that would have failed on the old code.
   */
  it('does not produce two level-1 headings', () => {
    const html = renderToStaticMarkup(
      createElement('div', null,
        createElement(TopbarTitle, { title: 'المستخدمون', subtitle: 'لوحة الإدارة' }),
        createElement(PageHeader, { title: 'إدارة المستخدمين' }),
      ),
    );
    expect(countH1(html)).toBe(1);
    // ...and the single h1 is the PAGE's, not the section label.
    expect(firstH1Text(html)).toBe('إدارة المستخدمين');
  });

  it('keeps the section label visible even though it is not a heading', () => {
    const html = renderToStaticMarkup(
      createElement('div', null,
        createElement(TopbarTitle, { title: 'Users', subtitle: 'Admin panel' }),
        createElement(PageHeader, { title: 'Manage users' }),
      ),
    );
    expect(html).toContain('Users');
    expect(countH1(html)).toBe(1);
  });
});

describe('topbarTitleFor — user create/edit titles', () => {
  it('gives the create route its own title, not the users-list title', () => {
    const t = topbarTitleFor(ADMIN_ROUTES.userCreate, AR);
    expect(t.title).toBe(AR.admin.users.form.create_title);
    expect(t.title).not.toBe(AR.admin.users.title);
  });

  it('gives the edit route its own title, not the users-list title', () => {
    const t = topbarTitleFor('/admin/users/42/edit', AR);
    expect(t.title).toBe(AR.admin.users.action_edit);
    expect(t.title).not.toBe(AR.admin.users.title);
  });

  it('resolves both in English too', () => {
    expect(topbarTitleFor(ADMIN_ROUTES.userCreate, EN).title).toBe(
      EN.admin.users.form.create_title,
    );
    expect(topbarTitleFor('/admin/users/7/edit', EN).title).toBe(EN.admin.users.action_edit);
  });

  it('does not emit an unresolved {name} placeholder on the edit route', () => {
    // `form.edit_title` contains `{name}` and this function has no user record.
    // Emitting it raw would render the literal token to the user.
    expect(topbarTitleFor('/admin/users/42/edit', AR).title).not.toContain('{name}');
    expect(topbarTitleFor('/admin/users/42/edit', EN).title).not.toContain('{name}');
  });

  it('leaves the users LIST title intact', () => {
    expect(topbarTitleFor(ADMIN_ROUTES.users, AR).title).toBe(AR.admin.users.title);
    expect(topbarTitleFor(ADMIN_ROUTES.users, EN).title).toBe(EN.admin.users.title);
  });

  it('does not let the edit pattern swallow sibling or unrelated routes', () => {
    // The regex is anchored and id-only; these must keep their own titles.
    expect(topbarTitleFor(ADMIN_ROUTES.userCreate, AR).title).not.toBe(
      AR.admin.users.action_edit,
    );
    expect(topbarTitleFor('/admin/users/42', AR).title).toBe(AR.admin.users.title);
    expect(topbarTitleFor('/admin/users/42/edit/extra', AR).title).toBe(AR.admin.users.title);
    expect(topbarTitleFor('/admin/pharmacies', AR).title).toBe(AR.admin.nav.pharmacies);
  });

  it('keeps a subtitle on the form routes so the topbar does not collapse', () => {
    expect(topbarTitleFor(ADMIN_ROUTES.userCreate, AR).subtitle).toBe(
      AR.admin.nav.panel_subtitle,
    );
    expect(topbarTitleFor('/admin/users/42/edit', AR).subtitle).toBe(
      AR.admin.nav.panel_subtitle,
    );
  });
});

describe('layout integration — the shells must USE TopbarTitle (STRUCTURAL GUARD)', () => {
  /**
   * ⚠️ STRUCTURAL GUARD, NOT A RENDERED-BEHAVIOR TEST — read this before
   * trusting it the way the suites above are trusted.
   *
   * WHY IT EXISTS
   * -------------
   * The tests above prove `TopbarTitle` renders no `<h1>`. That is necessary
   * but NOT sufficient: `Topbar.tsx` and `AdminLayout.tsx` must actually USE
   * the component. If either file were reverted to an inline
   * `<h1>{heading.title}</h1>`, every test above would still pass and the
   * duplicate-heading bug would return silently — which is exactly the failure
   * this whole phase exists to prevent.
   *
   * WHY IT READS SOURCE INSTEAD OF RENDERING
   * ----------------------------------------
   * Rendering `Topbar` or `AdminLayout` needs a DOM (auth context, TanStack
   * Query, `useLocation`, and `LanguageProvider`/`initTheme`, which touch
   * `document` at import). This suite runs in `environment: 'node'` and no DOM
   * implementation (`jsdom`/`happy-dom`) is installed; adding one is a new
   * dependency, which this task forbids. So the only available check is to read
   * the module's source and assert on its JSX.
   *
   * WHAT THIS PROVES AND WHAT IT CANNOT
   * -----------------------------------
   * ✅ proves:  the markup no longer contains a literal `<h1>` element, and the
   *             `TopbarTitle` component is referenced (not merely imported).
   * ❌ cannot:  prove what the BROWSER renders at runtime. Typecheck cannot
   *             catch this either (`<h1>` is valid JSX). Keep the browser
   *             verification (`harness/headings.html`) in any future re-audit.
   *
   * ROBUSTNESS: it strips comments first, so the several documentation blocks
   * that legitimately DISCUSS `<h1>` cannot mask a real one, and it does not
   * depend on line numbers, indentation, or the tag's attributes — a reformat
   * will not break it.
   */

  const shellSources: Record<string, string> = {
    'src/components/layout/Topbar.tsx': readFileSync(
      fileURLToPath(new URL('./Topbar.tsx', import.meta.url)),
      'utf8',
    ),
    'src/layouts/AdminLayout.tsx': readFileSync(
      fileURLToPath(new URL('../../layouts/AdminLayout.tsx', import.meta.url)),
      'utf8',
    ),
  };

  /** Strips JSX comments (brace-wrapped block comments) and line comments. */
  function stripComments(source: string): string {
    return source
      // JSX comments are wrapped in braces; strip the braces too.
      .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
      // Plain block comments.
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // Line comments — the `[^:]` guard keeps `https://` URLs intact.
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  }

  for (const [file, source] of Object.entries(shellSources)) {
    const jsx = stripComments(source);

    it(`${file} renders <TopbarTitle> (not merely imports it)`, () => {
      // A bare `import { TopbarTitle }` does not match `<TopbarTitle`, so this
      // fails if the component exists but was dropped from the JSX.
      expect(jsx).toMatch(/<TopbarTitle[\s/>]/);
      // Exactly one — a second one would double the label.
      expect(jsx.match(/<TopbarTitle[\s/>]/g)!.length).toBe(1);
    });

    it(`${file} contains no literal <h1> element`, () => {
      expect(jsx).not.toMatch(/<h1[\s/>]/);
    });
  }

  it('keeps TopbarTitle the single owner of the topbar title markup', () => {
    // If a shell ever copies the old `.topbar-title-group` block back inline
    // (instead of using the component), this fails even before an <h1> does.
    for (const [file, source] of Object.entries(shellSources)) {
      const jsx = stripComments(source);
      expect(
        jsx.includes('topbar-title-group'),
        `${file} should render <TopbarTitle>, not inline .topbar-title-group markup`,
      ).toBe(false);
    }
  });
});
