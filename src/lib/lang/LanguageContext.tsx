import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AR } from '@/lib/i18n';
import { EN } from './en';
import { LANG_EVENT, initLang, resolveLang, setLang, toggleLang } from './store';
import type { Lang } from './store';
import type { Strings } from './types';
import { LangContext, type LangContextValue } from './useLang';

/**
 * Language provider — mount ONCE above the router (see `App.tsx`).
 * Applies the stored language pre-mount via `initLang()` so the first paint
 * already has the right `dir`, then re-renders consumers on change.
 *
 * This module exports ONLY the `LanguageProvider` component (the `useLang` hook
 * and the context live in `./useLang.ts`) so React Fast Refresh works correctly.
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
