'use client';

import { type IntegrationStatusDto } from '@lifeos/shared';
import { Badge, Button, Input } from '@lifeos/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarSync } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/sheet';
import { useI18n } from '@/i18n/i18n';
import { api, ApiError } from '@/lib/api';
import { useUpdatePreferences } from '@/lib/queries';

/** Reminder preferences: in-app always, email opt-in, lead time for events. */
export function NotificationSettings({ emailReminders, eventReminderMinutes, enabled }: { emailReminders: boolean; eventReminderMinutes: number; enabled: boolean }) {
  const { t } = useI18n();
  const update = useUpdatePreferences();
  const [minutes, setMinutes] = useState(String(eventReminderMinutes));
  return (
    <div className="flex flex-col gap-4 p-5">
      <label className="flex items-center gap-2.5 text-[0.9375rem]">
        <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={enabled} onChange={(e) => update.mutate({ notificationsEnabled: e.target.checked })} />
        {t('notifications.enabled')}
      </label>
      <label className="flex items-start gap-2.5 text-[0.9375rem]">
        <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--accent)]" disabled={!enabled} checked={emailReminders} onChange={(e) => update.mutate({ emailReminders: e.target.checked })} />
        <span>
          {t('notifications.email')}
          <span className="block text-[0.8125rem] text-tertiary">{t('notifications.emailHint')}</span>
        </span>
      </label>
      <label className="flex flex-wrap items-center gap-2 text-[0.9375rem]">
        {t('notifications.leadTime')}
        <Input
          className="h-9 w-20"
          type="number"
          min={0}
          max={1440}
          value={minutes}
          disabled={!enabled}
          onChange={(e) => setMinutes(e.target.value)}
          onBlur={() => minutes !== String(eventReminderMinutes) && update.mutate({ eventReminderMinutes: Number(minutes) })}
        />
        {t('notifications.minutesBefore')}
      </label>
    </div>
  );
}

export function IntegrationSettings() {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['integrations'], queryFn: ({ signal }) => api<IntegrationStatusDto[]>('/integrations', { signal }) });
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ['integrations'] });
  const connect = useMutation({
    mutationFn: () => api<{ url: string }>('/integrations/google/connect'),
    onSuccess: ({ url }) => window.location.assign(url),
  });
  const sync = useMutation({ mutationFn: () => api<IntegrationStatusDto>('/integrations/google/sync', { method: 'POST', body: {} }), onSettled: refresh });
  const disconnect = useMutation({ mutationFn: () => api<void>('/integrations/google', { method: 'DELETE' }), onSettled: refresh });

  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get('google');
    if (result) setNotice(t(result === 'connected' ? 'integrations.connected' : result === 'cancelled' ? 'integrations.cancelled' : 'integrations.failed'));
  }, [t]);

  const error = [connect.error, sync.error, disconnect.error].find(Boolean);

  return (
    <div className="flex flex-col divide-y divide-separator">
      {notice ? <p role="status" className="px-5 py-3 text-[0.875rem] text-secondary">{notice}</p> : null}
      {(list.data ?? []).map((i) => (
        <div key={i.provider} className="flex flex-wrap items-start gap-3 p-5">
          <CalendarSync className="mt-0.5 h-5 w-5 text-secondary" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 font-medium">
              {t(i.provider === 'GOOGLE_CALENDAR' ? 'integrations.google' : 'integrations.apple')}
              {i.connected ? <Badge tone="positive">{t('integrations.on')}</Badge> : i.status === 'ERROR' ? <Badge tone="critical">{t('integrations.error')}</Badge> : null}
            </p>
            <p className="text-[0.8125rem] text-secondary">
              {i.connected
                ? `${i.account ?? ''}${i.lastSyncedAt ? ` · ${t('integrations.lastSync', { time: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(i.lastSyncedAt)) })}` : ''}`
                : i.available
                  ? t('integrations.googleHint')
                  : (i.unavailableReason ?? '')}
            </p>
            {i.lastSync?.errorMessage ? <p className="text-[0.8125rem] text-critical">{i.lastSync.errorMessage}</p> : null}
          </div>
          {i.provider === 'GOOGLE_CALENDAR' && i.available ? (
            i.connected || i.status === 'ERROR' ? (
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" loading={sync.isPending} onClick={() => sync.mutate()}>{t('integrations.syncNow')}</Button>
                <Button size="sm" variant="ghost" className="text-critical" onClick={() => setConfirm(true)}>{t('integrations.disconnect')}</Button>
              </div>
            ) : (
              <Button size="sm" loading={connect.isPending} onClick={() => connect.mutate()}>{t('integrations.connect')}</Button>
            )
          ) : null}
        </div>
      ))}
      {error ? <p role="alert" className="px-5 py-3 text-[0.875rem] text-critical">{error instanceof ApiError ? error.message : t('common.loadError')}</p> : null}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t('integrations.disconnectTitle')}
        description={t('integrations.disconnectBody')}
        confirmLabel={t('integrations.disconnect')}
        pending={disconnect.isPending}
        onConfirm={async () => {
          await disconnect.mutateAsync().catch(() => undefined);
          setConfirm(false);
        }}
      />
    </div>
  );
}
