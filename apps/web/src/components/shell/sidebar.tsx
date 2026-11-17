'use client';

import { cn } from '@lifeos/ui';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/i18n/i18n';
import { useUiStore } from '@/stores/ui';
import { Logo } from './logo';
import { NAV } from './nav';

export function SidebarNav({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { t } = useI18n();
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {NAV.map((group, gi) => (
        <div key={gi} className="flex flex-col gap-0.5">
          {group.label && !collapsed ? (
            <p className="px-3 pb-1 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-tertiary">
              {t(group.label)}
            </p>
          ) : null}
          {group.items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.slug}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                title={collapsed ? t(item.label) : undefined}
                className={cn(
                  'group flex h-9 items-center gap-3 rounded-sm px-3 text-[0.875rem] font-medium transition-colors duration-[var(--duration-fast)]',
                  active ? 'bg-accent-soft text-accent' : 'text-secondary hover:bg-sunken hover:text-primary',
                  collapsed && 'justify-center px-0',
                )}
              >
                <Icon aria-hidden className="h-[18px] w-[18px] shrink-0" strokeWidth={active ? 2.25 : 1.85} />
                {collapsed ? <span className="sr-only">{t(item.label)}</span> : <span className="truncate">{t(item.label)}</span>}
                {!collapsed && item.phase ? (
                  <span className="ml-auto text-[0.6875rem] font-medium text-tertiary">P{item.phase}</span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** Desktop sidebar (≥ lg). Collapsible; state persists per device. */
export function Sidebar() {
  const { t } = useI18n();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);

  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-separator bg-chrome px-3 py-4 backdrop-blur-xl backdrop-saturate-150 transition-[width] duration-[var(--duration-base)] ease-[var(--ease-standard)] lg:flex',
        collapsed ? 'w-[68px]' : 'w-[248px]',
      )}
    >
      <div className={cn('mb-6 flex items-center', collapsed ? 'justify-center' : 'justify-between pl-2')}>
        {!collapsed ? (
          <Link href="/today" className="flex items-center gap-2.5 rounded-sm">
            <Logo className="h-7 w-7" />
            <span className="font-display text-[1.0625rem] font-semibold tracking-[-0.02em]">LifeOS</span>
          </Link>
        ) : null}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
          aria-expanded={!collapsed}
          className="flex h-8 w-8 items-center justify-center rounded-sm text-secondary hover:bg-sunken hover:text-primary"
        >
          {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
        </button>
      </div>
      <div className="-mx-1 flex-1 overflow-y-auto px-1">
        <SidebarNav collapsed={collapsed} />
      </div>
    </aside>
  );
}
