'use client';

import { Button, Spinner } from '@lifeos/ui';
import * as Dialog from '@radix-ui/react-dialog';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { LogOut, Menu as MenuIcon, Settings, X } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useEffect } from 'react';
import { I18nProvider, useI18n } from '@/i18n/i18n';
import { useLogout, useMe, useResendVerification } from '@/lib/queries';
import { useUiStore } from '@/stores/ui';
import { Logo } from './logo';
import { Sidebar, SidebarNav } from './sidebar';

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

function AccountMenu({ name, email }: { name: string; email: string }) {
  const { t } = useI18n();
  const logout = useLogout();
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={`Account: ${name}`}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-[0.8125rem] font-semibold text-accent outline-none hover:brightness-95 focus-visible:ring-[3px] focus-visible:ring-accent/40"
      >
        {initials(name) || '·'}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-[220px] rounded-md bg-raised p-1.5 shadow-lg"
        >
          <div className="px-2.5 pb-2 pt-1.5">
            <p className="text-[0.875rem] font-medium">{name}</p>
            <p className="truncate text-[0.8125rem] text-secondary">{email}</p>
          </div>
          <Menu.Separator className="my-1 h-px bg-separator" />
          <Menu.Item asChild>
            <Link
              href="/settings"
              className="flex h-9 items-center gap-2.5 rounded-sm px-2.5 text-[0.875rem] outline-none data-[highlighted]:bg-sunken"
            >
              <Settings aria-hidden className="h-4 w-4 text-secondary" /> {t('nav.settings')}
            </Link>
          </Menu.Item>
          <Menu.Item
            onSelect={() => logout.mutate()}
            className="flex h-9 cursor-default items-center gap-2.5 rounded-sm px-2.5 text-[0.875rem] outline-none data-[highlighted]:bg-sunken"
          >
            <LogOut aria-hidden className="h-4 w-4 text-secondary" /> {t('nav.signOut')}
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

function MobileNav() {
  const { t } = useI18n();
  const open = useUiStore((s) => s.mobileNavOpen);
  const setOpen = useUiStore((s) => s.setMobileNavOpen);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('nav.openMenu')} className="lg:hidden">
          <MenuIcon className="h-5 w-5" />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay" />
        <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-[min(300px,85vw)] flex-col bg-raised px-3 py-4 shadow-lg outline-none">
          <div className="mb-6 flex items-center justify-between pl-2">
            <Dialog.Title className="flex items-center gap-2.5">
              <Logo className="h-7 w-7" />
              <span className="font-display text-[1.0625rem] font-semibold">LifeOS</span>
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t('nav.closeMenu')}>
                <X className="h-[18px] w-[18px]" />
              </Button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">{t('nav.openMenu')}</Dialog.Description>
          <div className="flex-1 overflow-y-auto">
            <SidebarNav onNavigate={() => setOpen(false)} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function VerifyBanner() {
  const { t } = useI18n();
  const resend = useResendVerification();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-separator bg-warning-soft px-4 py-2 text-[0.8125rem] text-primary sm:px-8">
      <span>{t('auth.verifyBanner')}</span>
      {resend.isSuccess ? (
        <span className="text-positive" role="status">
          {t('auth.resent')}
        </span>
      ) : (
        <Button variant="link" size="sm" loading={resend.isPending} onClick={() => resend.mutate()}>
          {t('auth.resend')}
        </Button>
      )}
    </div>
  );
}

/** Keeps <html> lang and the appearance override in sync with saved preferences. */
function useApplyPreferences(locale: string | undefined, theme: string | undefined) {
  useEffect(() => {
    if (locale) document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    if (!theme) return;
    const root = document.documentElement;
    try {
      if (theme === 'light' || theme === 'dark') {
        root.dataset.theme = theme;
        localStorage.setItem('lifeos-theme', theme);
      } else {
        delete root.dataset.theme;
        localStorage.removeItem('lifeos-theme');
      }
    } catch {
      /* storage unavailable: appearance still follows the OS */
    }
  }, [theme]);
}

export function AppShell({ children }: { children: ReactNode }) {
  const me = useMe();
  const prefs = me.data?.preferences;
  const locale = prefs?.locale ?? 'en';
  useApplyPreferences(prefs?.locale, prefs?.theme);

  if (me.isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-secondary">
        <Spinner />
      </div>
    );
  }
  if (me.isError || !me.data) {
    // The API client redirects to /login on an ended session; this covers network failures.
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 text-center">
        <p className="font-medium">LifeOS can’t reach the server.</p>
        <Button variant="secondary" onClick={() => me.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const { user } = me.data;
  return (
    <I18nProvider locale={locale}>
      <div className="flex min-h-dvh">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-separator bg-chrome px-4 backdrop-blur-xl backdrop-saturate-150 sm:px-8 lg:border-transparent lg:bg-transparent lg:backdrop-blur-none">
            <div className="flex items-center gap-2 lg:hidden">
              <MobileNav />
              <Link href="/today" className="flex items-center gap-2">
                <Logo className="h-6 w-6" />
                <span className="font-display font-semibold">LifeOS</span>
              </Link>
            </div>
            <div className="ml-auto">
              <AccountMenu name={user.displayName} email={user.email} />
            </div>
          </header>
          {!user.emailVerified ? <VerifyBanner /> : null}
          <main id="main" className="flex-1 px-4 pb-16 sm:px-8">
            {children}
          </main>
        </div>
      </div>
    </I18nProvider>
  );
}
