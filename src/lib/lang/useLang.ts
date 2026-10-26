import { useContext } from 'react';
import type { Lang } from './store';
import type { Strings } from './types';

/** Context value shape — consumers get lang, dictionary, setters, and RTL flag. */
export interface LangContextValue {
  lang: Lang;
  /** `AR` when Arabic, `EN` when English — drop-in for `AR.xxx` usages. */
  STR: Strings;
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
  /** `true` when the UI is Arabic (RTL). */
  isRtl: boolean;
}

import { createContext } from 'react';

/**
 * Created with a `null` default so the provider MUST wrap consumers.
 * Extracted to a hook-only module so `LanguageContext.tsx` exports only the
 * `LanguageProvider` component (Fast Refresh happy).
 */
export const LangContext = createContext<LangContextValue | null>(null);

/** Current language + dictionary. Throws outside `LanguageProvider`. */
export function useLang(): LangContextValue {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('[i18n] useLang() must be used inside <LanguageProvider>');
  return ctx;
}
