'use client';

import { type UserPreferencesDto } from '@lifeos/shared';
import { Button, Field, Input, SectionHeader, Surface } from '@lifeos/ui';
import * as Dialog from '@radix-ui/react-dialog';
import { useMutation } from '@tanstack/react-query';
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { AvailabilitySettings } from '@/components/settings/availability';
import { useI18n } from '@/i18n/i18n';
import { api, ApiError } from '@/lib/api';
import { useMe, useUpdatePreferences, useUpdateProfile } from '@/lib/queries';

const selectClass =
  'h-11 w-full rounded-md border border-separator bg-raised px-3 text-[0.9375rem] text-primary outline-none focus:border-accent focus:ring-[3px] focus:ring-accent/25';

function Row({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">{children}</div>;
}

function SaveBar({ pending, saved, error }: { pending: boolean; saved: boolean; error?: string | undefined }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-end gap-3 border-t border-separator px-5 py-3">
      {error ? (
        <p role="alert" className="mr-auto text-[0.8125rem] text-critical">
          {error}
        </p>
      ) : saved ? (
        <p role="status" className="mr-auto text-[0.8125rem] text-positive">
          {t('common.saved')}
        </p>
      ) : null}
      <Button type="submit" size="sm" loading={pending}>
        {t('common.save')}
      </Button>
    </div>
  );
}

function ProfileForm({ initialName }: { initialName: string }) {
  const update = useUpdateProfile();
  const [name, setName] = useState(initialName);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        update.mutate({ displayName: name });
      }}
    >
      <Row>
        <Field label="Display name" error={update.error instanceof ApiError ? update.error.fieldError('displayName') : undefined}>
          {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="given-name" />}
        </Field>
      </Row>
      <SaveBar pending={update.isPending} saved={update.isSuccess} error={update.error?.message} />
    </form>
  );
}

function PreferencesForm({ prefs }: { prefs: UserPreferencesDto }) {
  const update = useUpdatePreferences();
  const [draft, setDraft] = useState(prefs);
  useEffect(() => setDraft(prefs), [prefs]);
  const timezones = useMemo(() => {
    try {
      return Intl.supportedValuesOf('timeZone');
    } catch {
      return [prefs.timezone];
    }
  }, [prefs.timezone]);
  const set = <K extends keyof UserPreferencesDto>(k: K, v: UserPreferencesDto[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const err = (f: string) => (update.error instanceof ApiError ? update.error.fieldError(f) : undefined);

  function submit(e: FormEvent) {
    e.preventDefault();
    update.mutate({
      timezone: draft.timezone,
      locale: draft.locale,
      theme: draft.theme,
      dayStartTime: draft.dayStartTime,
      dayEndTime: draft.dayEndTime,
      workStartTime: draft.workStartTime,
      workEndTime: draft.workEndTime,
      minSessionMinutes: draft.minSessionMinutes,
      bufferMinutes: draft.bufferMinutes,
    });
  }

  return (
    <form onSubmit={submit}>
      <Row>
        <Field label="Time zone" error={err('timezone')}>
          {(p) => (
            <select {...p} className={selectClass} value={draft.timezone} onChange={(e) => set('timezone', e.target.value)}>
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Language">
          {(p) => (
            <select {...p} className={selectClass} value={draft.locale} onChange={(e) => set('locale', e.target.value as 'en' | 'fr')}>
              <option value="en">English</option>
              <option value="fr">Français</option>
            </select>
          )}
        </Field>
        <Field label="Appearance" hint="“Automatic” follows your device setting.">
          {(p) => (
            <select
              {...p}
              className={selectClass}
              value={draft.theme}
              onChange={(e) => set('theme', e.target.value as UserPreferencesDto['theme'])}
            >
              <option value="system">Automatic</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          )}
        </Field>
      </Row>
      <div className="border-t border-separator" />
      <Row>
        <Field label="Day starts" error={err('dayStartTime')}>
          {(p) => <Input {...p} type="time" value={draft.dayStartTime} onChange={(e) => set('dayStartTime', e.target.value)} />}
        </Field>
        <Field label="Day ends" error={err('dayEndTime')}>
          {(p) => <Input {...p} type="time" value={draft.dayEndTime} onChange={(e) => set('dayEndTime', e.target.value)} />}
        </Field>
        <Field label="Work starts" error={err('workStartTime')}>
          {(p) => <Input {...p} type="time" value={draft.workStartTime} onChange={(e) => set('workStartTime', e.target.value)} />}
        </Field>
        <Field label="Work ends" error={err('workEndTime')}>
          {(p) => <Input {...p} type="time" value={draft.workEndTime} onChange={(e) => set('workEndTime', e.target.value)} />}
        </Field>
        <Field label="Shortest useful session" hint="Free gaps shorter than this aren’t counted." error={err('minSessionMinutes')}>
          {(p) => (
            <select {...p} className={selectClass} value={draft.minSessionMinutes} onChange={(e) => set('minSessionMinutes', Number(e.target.value))}>
              {[15, 20, 25, 30, 45, 60].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Buffer between activities" error={err('bufferMinutes')}>
          {(p) => (
            <select {...p} className={selectClass} value={draft.bufferMinutes} onChange={(e) => set('bufferMinutes', Number(e.target.value))}>
              {[0, 5, 10, 15, 20, 30].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          )}
        </Field>
      </Row>
      <SaveBar pending={update.isPending} saved={update.isSuccess} error={update.error && !err('timezone') ? update.error.message : undefined} />
    </form>
  );
}

function DataControls() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const remove = useMutation({
    mutationFn: () => api<void>('/users/me', { method: 'DELETE', body: { password, confirm } }),
    onSuccess: () => window.location.assign('/register'),
  });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <p className="text-[0.9375rem] font-medium">Export your data</p>
          <p className="text-[0.8125rem] text-secondary">Download everything LifeOS stores about you as JSON.</p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <a href="/api/v1/users/me/export" download>
            Download export
          </a>
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-separator px-5 py-4">
        <div>
          <p className="text-[0.9375rem] font-medium text-critical">Delete account</p>
          <p className="text-[0.8125rem] text-secondary">Permanently removes your account and all of its data.</p>
        </div>
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger asChild>
            <Button variant="secondary" size="sm" className="text-critical">
              Delete account…
            </Button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay" />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-raised p-6 shadow-lg outline-none">
              <Dialog.Title className="text-[1.125rem] font-semibold">Delete your account?</Dialog.Title>
              <Dialog.Description className="mt-1.5 text-[0.875rem] text-secondary">
                This can’t be undone. All goals, tasks, events and habits will be deleted. Consider exporting your data first.
              </Dialog.Description>
              <form
                className="mt-5 flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  remove.mutate();
                }}
              >
                <Field label="Password" error={remove.error?.message}>
                  {(p) => <Input {...p} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
                </Field>
                <Field label="Type DELETE to confirm">
                  {(p) => <Input {...p} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />}
                </Field>
                <div className="mt-1 flex justify-end gap-2">
                  <Dialog.Close asChild>
                    <Button type="button" variant="secondary">
                      Cancel
                    </Button>
                  </Dialog.Close>
                  <Button type="submit" variant="destructive" disabled={confirm !== 'DELETE' || !password} loading={remove.isPending}>
                    Delete account
                  </Button>
                </div>
              </form>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </>
  );
}

export default function SettingsPage() {
  const { t } = useI18n();
  const me = useMe();
  if (!me.data) return null;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 pt-6">
      <h1 className="font-display text-[2rem] font-bold tracking-[-0.025em]">{t('nav.settings')}</h1>
      <section>
        <SectionHeader title="Profile" detail={me.data.user.email} />
        <Surface>
          <ProfileForm initialName={me.data.user.displayName} />
        </Surface>
      </section>
      {me.data.preferences ? (
        <section>
          <SectionHeader title="Your day" />
          <Surface>
            <PreferencesForm prefs={me.data.preferences} />
          </Surface>
        </section>
      ) : null}
      <section>
        <SectionHeader title={t('availability.title')} />
        <Surface>
          <AvailabilitySettings />
        </Surface>
      </section>
      <section>
        <SectionHeader title="Data & privacy" />
        <Surface>
          <DataControls />
        </Surface>
      </section>
    </div>
  );
}
