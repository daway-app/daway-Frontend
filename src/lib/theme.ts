/**
 * Theme store — mirrors the Blade behaviour, plus the system preference.
 *
 * Source of truth for behaviour:
 *   daway-backend/resources/views/components/topbar.blade.php
 *     · toggleDarkMode() toggles `.dark-mode` on <body> AND <html>
 *     · persists to localStorage under the key "theme" ("dark" | "light")
 *     · on DOMContentLoaded reads localStorage and applies `.dark-mode` to body
 *
 * Tokens are declared for both `html.dark-mode` and `body.dark-mode`
 * (see styles/tokens.css), so both elements must carry the class.
 *
 * ---------------------------------------------------------------------------
 * SYSTEM PREFERENCE (`prefers-color-scheme`) — ADDED
 * ---------------------------------------------------------------------------
 * Blade never consulted the OS setting, so a user who runs their machine in
 * dark mode got a white app until they pressed the toggle, and the choice was
 * then frozen for good. The rule here is the conventional one:
 *
 *   · an EXPLICIT choice (the toggle was pressed at least once) always wins and
 *     is what gets persisted;
 *   · with NO explicit choice the app follows the OS, live — flipping the
 *     system setting re-themes the app without a reload.
 *
 * The pre-paint snippet in `index.html` implements the same rule, so the first
 * paint is already correct (no flash of the wrong theme).
 */

export type Theme = 'light' | 'dark';

const THEME_KEY = 'theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function apply(theme: Theme): void {
  const isDark = theme === 'dark';
  document.body.classList.toggle('dark-mode', isDark);
  document.documentElement.classList.toggle('dark-mode', isDark);
  // 🔴 `data-theme` used to be set here too. It was write-only — no CSS
  // selector and no component ever read it — so it was removed (Phase 5).
  // The class on <html> is the single contract, and it is the one the
  // pre-paint snippet can set before <body> exists.
  // Charts read colours from CSS tokens at draw time and must be rebuilt when
  // the theme flips — the Blade app does this with a MutationObserver on
  // documentElement; React charts subscribe to this event instead.
  window.dispatchEvent(new CustomEvent('daway:theme-changed', { detail: theme }));
}

/** The user's explicit choice, or `null` when they have never chosen. */
function explicitTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    return null;
  }
}

/** The OS preference. Absent/unsupported → light, the app's default. */
function systemTheme(): Theme {
  try {
    return window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** Explicit choice wins; otherwise follow the OS. */
export function resolveTheme(): Theme {
  return explicitTheme() ?? systemTheme();
}

/** The theme that will be applied — explicit choice, else the system's. */
export function getStoredTheme(): Theme {
  return resolveTheme();
}

/**
 * Follow OS changes — but ONLY while the user has made no explicit choice.
 * Guarded so the listener is attached once even though `initTheme()` runs from
 * both shells' mount effects.
 */
let watchingSystem = false;
function watchSystemTheme(): void {
  if (watchingSystem) return;
  const query = window.matchMedia?.(DARK_QUERY);
  if (!query?.addEventListener) return;
  watchingSystem = true;
  query.addEventListener('change', (event) => {
    if (explicitTheme() !== null) return; // a stored choice wins, always
    apply(event.matches ? 'dark' : 'light');
  });
}

/** Apply the resolved theme on boot — called once per shell mount. */
export function initTheme(): Theme {
  const theme = resolveTheme();
  apply(theme);
  watchSystemTheme();
  return theme;
}

/** Toggle the theme, persist it as an explicit choice, and return the new value. */
export function toggleTheme(): Theme {
  const next: Theme = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
  apply(next);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    /* storage unavailable — theme still applied for this session */
  }
  return next;
}
