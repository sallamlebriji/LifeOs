'use client';

import * as Popover from '@radix-ui/react-dropdown-menu';
import { type NotificationListDto } from '@lifeos/shared';
import { Button, cn } from '@lifeos/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CalendarClock, Clock, Repeat } from 'lucide-react';
import { useI18n } from '@/i18n/i18n';
import { api } from '@/lib/api';

const ICON = { EVENT_REMINDER: CalendarClock, DEADLINE_ALERT: Clock, HABIT_REMINDER: Repeat } as const;

export function NotificationBell() {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['notifications'],
    queryFn: ({ signal }) => api<NotificationListDto>('/notifications', { signal }),
    refetchInterval: 60_000,
  });
  const readAll = useMutation({
    mutationFn: () => api<void>('/notifications/read-all', { method: 'POST', body: {} }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const unread = list.data?.unread ?? 0;
  const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

  return (
    <Popover.Root onOpenChange={(open) => !open && unread > 0 && readAll.mutate()}>
      <Popover.Trigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={unread ? t('notifications.labelUnread', { count: unread }) : t('notifications.label')}>
          <Bell className="h-5 w-5" />
          {unread ? (
            <span aria-hidden className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-critical px-1 text-[0.625rem] font-semibold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} className="z-50 w-[min(360px,calc(100vw-24px))] rounded-lg bg-raised p-1.5 shadow-lg">
          <p className="px-2.5 pb-1.5 pt-1 text-[0.875rem] font-semibold">{t('notifications.title')}</p>
          {!list.data?.items.length ? (
            <p className="px-2.5 pb-3 pt-1 text-[0.875rem] text-secondary">{t('notifications.empty')}</p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              {list.data.items.map((n) => {
                const Icon = ICON[n.type as keyof typeof ICON] ?? Bell;
                return (
                  <Popover.Item key={n.id} className={cn('flex cursor-default gap-3 rounded-md px-2.5 py-2 outline-none data-[highlighted]:bg-sunken', !n.read && 'bg-accent-soft/40')}>
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-secondary" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.875rem] font-medium">{n.title}</span>
                      {n.body ? <span className="block text-[0.8125rem] text-secondary">{n.body}</span> : null}
                      <span className="block text-[0.75rem] text-tertiary">{fmt.format(new Date(n.at))}</span>
                    </span>
                    {!n.read ? <span className="sr-only">{t('notifications.unread')}</span> : null}
                  </Popover.Item>
                );
              })}
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
