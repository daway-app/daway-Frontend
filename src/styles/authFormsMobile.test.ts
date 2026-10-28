import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * F2 — the auth stylesheet must never pad `body` (Phase 1B.3).
 *
 * WHY THIS IS A STRUCTURAL CSS GUARD
 * ----------------------------------
 * `auth-forms.css` is imported ONCE for the whole app, so any `body` rule in it
 * leaks into every screen. The mobile query at the bottom of the file used to
 * carry `body { padding: 14px }`, which padded the pharmacy and admin shells on
 * phones (measured: `getComputedStyle(document.body).padding === "14px"` at
 * 390px) and double-padded the auth screen on top of `.auth-shell`'s own 28px.
 *
 * A CSS rule cannot be asserted by rendering in this suite (no DOM), and a
 * browser measurement is manual, so the regression is pinned at the source: no
 * `body` rule with `padding` may exist anywhere in the file, and the 420px query
 * must scope its padding to `.auth-shell` instead.
 *
 * LIMITATION: this proves the STYLESHEET's text, not the computed layout. The
 * rendered result is verified in the real-browser pass reported with Phase 1B.3.
 */

const CSS = readFileSync(
  fileURLToPath(new URL('./pages/auth-forms.css', import.meta.url)),
  'utf8',
);

// Comments must go FIRST: the file's own header quotes the old Blade rule
// (`body { display: flex; padding: 28px }`), which would otherwise trip every
// assertion below.
const CSS_SOURCE = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

/** Extracts the `{ ... }` body of the first block whose header contains `header`. */
function blockAfter(source: string, header: string): string | null {
  const at = source.indexOf(header);
  if (at === -1) return null;
  const open = source.indexOf('{', at);
  if (open === -1) return null;

  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return null;
}

describe('auth-forms.css — no global body padding (F2)', () => {
  it('declares no `body` rule with padding anywhere in the file', () => {
    // Catches `body { padding: … }` at top level AND inside any media query.
    expect(CSS_SOURCE).not.toMatch(/(^|\n)\s*body\s*\{[^}]*padding/);
  });

  it('still keeps the base `.auth-shell` padding for tablet/desktop', () => {
    expect(CSS_SOURCE).toMatch(/\.auth-shell\s*\{[^}]*padding:\s*28px/);
  });

  it('scopes the 420px padding to `.auth-shell`', () => {
    const mobile = blockAfter(CSS_SOURCE, '@media (max-width: 420px)');

    expect(mobile).not.toBeNull();
    expect(mobile ?? '').toMatch(/\.auth-shell\s*\{[^}]*padding:\s*14px/);
    // The regression: a `body` selector inside this query.
    expect(mobile ?? '').not.toMatch(/(^|[\s}])body\s*\{/);
  });

  it('keeps the auth form’s own mobile padding (the card must not go edge-to-edge)', () => {
    const mobile = blockAfter(CSS_SOURCE, '@media (max-width: 420px)');
    expect(mobile ?? '').toMatch(/\.auth-form-side\s*\{[^}]*padding:\s*32px 22px/);
  });
});
