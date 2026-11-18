'use client';

import { type AvailabilityKindValue, type AvailabilityRuleDto } from '@lifeos/shared';
import { Badge, Button, Field, Input, Select } from '@lifeos/ui';
import { Plus, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { errorFor } from '@/components/ui/fields';
import { useI18n } from '@/i18n/i18n';
import { useAvailability, useCreateRule, useDeleteRule } from '@/lib/module-queries';

const KINDS: AvailabilityKindValue[] = ['WORKING_HOURS', 'UNAVAILABLE', 'PREFERRED', 'PROTECTED_FREE_TIME'];
const TONE: Record<AvailabilityKindValue, 'accent' | 'critical' | 'positive' | 'warning'> = {
  WORKING_HOURS: 'accent',
  UNAVAILABLE: 'critical',
  PREFERRED: 'positive',
  PROTECTED_FREE_TIME: 'warning',
};

/** Weekly availability rules the planner (Phase 3) will respect. */
export function AvailabilitySettings() {
  const { t, locale } = useI18n();
  const rules = useAvailability();
  const create = useCreateRule();
  const remove = useDeleteRule();
  const [kind, setKind] = useState<AvailabilityKindValue>('WORKING_HOURS');
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('18:00');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string>();
  const names = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(`2026-11-${15 + i}T12:00:00Z`)),
  );

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    if (!weekdays.length) return setError(t('availability.pickDay'));
    try {
      // One rule per weekday keeps rules simple to edit and reason about.
      for (const weekday of weekdays) {
        await create.mutateAsync({ kind, weekday, startTime: start, endTime: end, label: label.trim() || null });
      }
      setLabel('');
    } catch (err) {
      setError(errorFor(err, 'endTime') ?? errorFor(err));
    }
  }

  const byDay = (r: AvailabilityRuleDto) => (r.weekday === null ? 7 : (r.weekday + 6) % 7);
  const sorted = [...(rules.data ?? [])].sort((a, b) => byDay(a) - byDay(b) || (a.startTime ?? '').localeCompare(b.startTime ?? ''));

  return (
    <div className="flex flex-col gap-4 p-5">
      <p className="text-[0.875rem] text-secondary">{t('availability.intro')}</p>
      {sorted.length ? (
        <ul className="flex flex-col divide-y divide-separator rounded-md border border-separator">
          {sorted.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-[0.875rem]">
              <span className="w-12 font-medium">{r.weekday !== null ? names[r.weekday] : '—'}</span>
              <span className="tabular-nums">
                {r.startTime && r.endTime
                  ? `${r.startTime}–${r.endTime}`
                  : `${new Date(r.startsAt!).toLocaleDateString(locale)} → ${new Date(r.endsAt!).toLocaleDateString(locale)}`}
              </span>
              <Badge tone={TONE[r.kind]}>{t(`availability.${r.kind}`)}</Badge>
              {r.label ? <span className="truncate text-secondary">{r.label}</span> : null}
              <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label={t('availability.remove')} onClick={() => remove.mutate(r.id)}>
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[0.875rem] text-tertiary">{t('availability.empty')}</p>
      )}

      <form className="flex flex-col gap-3 rounded-md bg-sunken/60 p-3.5" onSubmit={add} noValidate>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <Field label={t('availability.kind')}>
            {(p) => (
              <Select {...p} value={kind} onChange={(e) => setKind(e.target.value as AvailabilityKindValue)}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`availability.${k}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('calendar.starts')}>{(p) => <Input {...p} type="time" value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
          <Field label={t('calendar.ends')}>{(p) => <Input {...p} type="time" value={end} onChange={(e) => setEnd(e.target.value)} />}</Field>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('habits.specificDays')}>
          {[1, 2, 3, 4, 5, 6, 0].map((d) => {
            const on = weekdays.includes(d);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() => setWeekdays(on ? weekdays.filter((x) => x !== d) : [...weekdays, d])}
                className={`h-9 min-w-11 rounded-md px-2 text-[0.8125rem] font-medium ${on ? 'bg-accent text-on-accent' : 'bg-raised text-secondary'}`}
              >
                {names[d]}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <Input className="h-10" placeholder={t('availability.label')} aria-label={t('availability.label')} value={label} onChange={(e) => setLabel(e.target.value)} />
          <Button type="submit" variant="secondary" loading={create.isPending}>
            {create.isPending ? null : <Plus className="h-4 w-4" aria-hidden />}
            {t('availability.add')}
          </Button>
        </div>
        {error ? (
          <p role="alert" className="text-[0.8125rem] text-critical">
            {error}
          </p>
        ) : null}
      </form>
    </div>
  );
}
