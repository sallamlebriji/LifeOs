'use client';

import { Surface } from '@lifeos/ui';
import { type ReactNode, useEffect, useState } from 'react';
import { I18nProvider } from '@/i18n/i18n';
import { type Locale } from '@/i18n/messages';
import { Logo } from '../shell/logo';

/** Signed-out frame. Language follows the browser until the user's preference is known. */
export function AuthShell({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>('en');
  useEffect(() => {
    if (navigator.language.toLowerCase().startsWith('fr')) setLocale('fr');
  }, []);

  return (
    <I18nProvider locale={locale}>
      <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
        <div className="mb-8 flex items-center gap-2.5">
          <Logo className="h-8 w-8" />
          <span className="font-display text-[1.25rem] font-semibold tracking-[-0.02em]">LifeOS</span>
        </div>
        <Surface className="w-full max-w-[400px] rounded-xl p-7 shadow-md sm:p-8">{children}</Surface>
      </main>
    </I18nProvider>
  );
}

export function AuthHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-[1.5rem] font-semibold leading-tight tracking-[-0.02em]">{title}</h1>
      {subtitle ? <p className="mt-1.5 text-[0.9375rem] text-secondary">{subtitle}</p> : null}
    </div>
  );
}

export function FormError({ message }: { message?: string | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md bg-critical-soft px-3.5 py-2.5 text-[0.875rem] text-critical">
      {message}
    </p>
  );
}
