/**
 * Language store — `ar` (RTL) | `en` (LTR), persisted in localStorage.
 *
 * Mirrors the theme store (`src/lib/theme.ts`): an explicit choice always
 * wins, the default is `ar` (the Blade app defaults to Arabic), and applying
 * a language sets `document.documentElement.lang + dir` so the whole layout
 * mirrors (sidebar, topbar, toasts…) without per-component work.
 *
 * `index.html` carries a pre-paint snippet (same idea as the theme one) that
 * applies the stored language before first paint — no direction flash.
 */

export type Lang = 'ar' | 'en';

export const LANG_KEY = 'daway.lang';
export const LANG_EVENT = 'daway:lang-changed';

export const LANG_DIR: Record<Lang, 'rtl' | 'ltr'> = { ar: 'rtl', en: 'ltr' };

/** Stored choice, or `null` when the user never chose (→ default `ar`). */
export function explicitLang(): Lang | null {
  try {
    const value = localStorage.getItem(LANG_KEY);
    return value === 'ar' || value === 'en' ? value : null;
  } catch {
    return null;
  }
}

/** Current language — explicit choice wins, otherwise Arabic (Blade parity). */
export function resolveLang(): Lang {
  return explicitLang() ?? 'ar';
}

function apply(lang: Lang): void {
  document.documentElement.lang = lang;
  document.documentElement.dir = LANG_DIR[lang];
  document.title = lang === 'ar' ? 'دواك — الصيدلية' : 'Daway — Pharmacy';
  window.dispatchEvent(new CustomEvent<Lang>(LANG_EVENT, { detail: lang }));
}

/** Apply the resolved language on boot — called once per app mount. */
export function initLang(): Lang {
  const lang = resolveLang();
  apply(lang);
  return lang;
}

/** Persist + apply a language, and return it. */
export function setLang(lang: Lang): Lang {
  apply(lang);
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* storage unavailable — language still applied for this session */
  }
  return lang;
}

/** Toggle `ar` ↔ `en`. */
export function toggleLang(): Lang {
  return setLang(resolveLang() === 'ar' ? 'en' : 'ar');
}
