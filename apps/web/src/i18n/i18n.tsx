'use client';

import { createContext, type ReactNode, useCallback, useContext, useMemo } from 'react';
import { type Locale, type MessageKey, MESSAGES } from './messages';

interface I18n {
  locale: Locale;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

export function translate(
  locale: Locale,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const template = MESSAGES[locale][key] ?? MESSAGES.en[key];
  return vars ? template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`)) : template;
}

const I18nContext = createContext<I18n>({
  locale: 'en',
  t: (key, vars) => translate('en', key, vars),
});

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const t = useCallback<I18n['t']>((key, vars) => translate(locale, key, vars), [locale]);
  const value = useMemo(() => ({ locale, t }), [locale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  return useContext(I18nContext);
}
