import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AR } from '@/lib/i18n';
import { EN } from './en';
import { LANG_EVENT, initLang, resolveLang, setLang, toggleLang } from './store';
import type { Lang } from './store';

export type { Lang };
/** Union of both dictionaries — identical key shape (verified by tooling). */
export type Strings = typeof AR;

interface LangContextValue {
  lang: Lang;
  /** `AR` when Arabic, `EN` when English — drop-in for `AR.xxx` usages. */
  STR: Strings;
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
  /** `true` when the UI is Arabic (RTL). */
  isRtl: boolean;
}

const LangContext = createContext<LangContextValue | null>(null);

/**
 * Language provider — mount ONCE above the router (see `App.tsx`).
 * Applies the stored language pre-mount via `initLang()` so the first paint
 * already has the right `dir`, then re-renders consumers on change.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => initLang());

  useEffect(() => {
    const onChange = (event: Event) => {
      setLangState((event as CustomEvent<Lang>).detail ?? resolveLang());
    };
    window.addEventListener(LANG_EVENT, onChange);
    return () => window.removeEventListener(LANG_EVENT, onChange);
  }, []);

  const set = useCallback((next: Lang) => {
    setLang(next);
    setLangState(next);
  }, []);

  const toggle = useCallback(() => {
    const next = toggleLang();
    setLangState(next);
  }, []);

  const value: LangContextValue = {
    lang,
    STR: (lang === 'ar' ? AR : (EN as unknown as Strings)) as Strings,
    setLang: set,
    toggleLang: toggle,
    isRtl: lang === 'ar',
  };
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

/** Current language + dictionary. Throws outside `LanguageProvider`. */
export function useLang(): LangContextValue {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('[i18n] useLang() must be used inside <LanguageProvider>');
  return ctx;
}
