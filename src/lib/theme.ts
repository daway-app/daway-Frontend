/**
 * Theme store — mirrors the Blade behaviour exactly.
 *
 * Source of truth for behaviour:
 *   daway-backend/resources/views/components/topbar.blade.php
 *     · toggleDarkMode() toggles `.dark-mode` on <body> AND <html>
 *     · persists to localStorage under the key "theme" ("dark" | "light")
 *     · on DOMContentLoaded reads localStorage and applies `.dark-mode` to body
 *
 * Tokens are declared for both `html.dark-mode` and `body.dark-mode`
 * (see styles/tokens.css), so both elements must carry the class.
 */

export type Theme = 'light' | 'dark';

const THEME_KEY = 'theme';

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

/** Read the persisted theme, defaulting to light (as Blade does). */
export function getStoredTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** Apply the stored theme on boot — called once from the app entry. */
export function initTheme(): Theme {
  const theme = getStoredTheme();
  apply(theme);
  return theme;
}

/** Toggle the theme, persist it, and return the new value. */
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
