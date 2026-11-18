'use client';

import { addDaysKey, startOfWeekKey } from '@lifeos/shared';
import { type PlanRequestInput } from '@lifeos/validation';
import { Button, Field, Input, Select } from '@lifeos/ui';
import { Plus, Sparkles, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { errorFor } from '@/components/ui/fields';
import { useI18n } from '@/i18n/i18n';

interface ActivityRow {
  title: string;
  durationMinutes: string;
  sessions: string;
  preferredTimeOfDay: 'ANY' | 'MORNING' | 'AFTERNOON' | 'EVENING';
  recoveryHours: string;
}

const emptyActivity = (): ActivityRow => ({ title: '', durationMinutes: '60', sessions: '1', preferredTimeOfDay: 'ANY', recoveryHours: '0' });

/** Structured planning request. Works with or without an AI provider. */
export function PlanForm({
  today,
  weekStartsOn,
  pending,
  error,
  onSubmit,
}: {
  today: string;
  weekStartsOn: number;
  pending: boolean;
  error: unknown;
  onSubmit: (req: PlanRequestInput) => void;
}) {
  const { t } = useI18n();
  const weekEnd = addDaysKey(startOfWeekKey(today, weekStartsOn), 6);
  const nextWeek = addDaysKey(startOfWeekKey(today, weekStartsOn), 7);
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(weekEnd);
  const [includeTasks, setIncludeTasks] = useState(true);
  const [rows, setRows] = useState<ActivityRow[]>([]);

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit({
      startDate: start,
      endDate: end,
      includeOpenTasks: includeTasks,
      activities: rows
        .filter((r) => r.title.trim())
        .map((r) => ({
          title: r.title.trim(),
          durationMinutes: Number(r.durationMinutes),
          sessions: Number(r.sessions),
          preferredTimeOfDay: r.preferredTimeOfDay,
          recoveryHours: Number(r.recoveryHours),
          window: 'any' as const,
        })),
    });
  }

  const update = (i: number, patch: Partial<ActivityRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const general = error && !errorFor(error, 'endDate') && !errorFor(error, 'activities') ? errorFor(error) : undefined;

  return (
    <form className="flex flex-col gap-4 p-5" onSubmit={submit} noValidate>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={() => (setStart(today), setEnd(weekEnd))}>
          {t('planner.restOfWeek')}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => (setStart(nextWeek), setEnd(addDaysKey(nextWeek, 6)))}>
          {t('planner.nextWeek')}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => (setStart(addDaysKey(today, 1)), setEnd(addDaysKey(today, 1)))}>
          {t('planner.tomorrow')}
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('planner.from')}>{(p) => <Input {...p} type="date" value={start} min={today} onChange={(e) => setStart(e.target.value)} />}</Field>
        <Field label={t('planner.to')} error={errorFor(error, 'endDate')}>
          {(p) => <Input {...p} type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />}
        </Field>
      </div>
      <label className="flex items-start gap-2.5 text-[0.9375rem]">
        <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--accent)]" checked={includeTasks} onChange={(e) => setIncludeTasks(e.target.checked)} />
        <span>
          {t('planner.includeTasks')}
          <span className="block text-[0.8125rem] text-tertiary">{t('planner.includeTasksHint')}</span>
        </span>
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-[0.8125rem] font-medium text-secondary">{t('planner.activities')}</legend>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 rounded-md bg-sunken/60 p-2.5 sm:grid-cols-[1fr_90px_80px_130px_90px_auto]">
            <Input className="col-span-2 h-10 sm:col-span-1" aria-label={t('planner.activityTitle')} placeholder={t('planner.activityPlaceholder')} value={r.title} onChange={(e) => update(i, { title: e.target.value })} />
            <Select className="h-10" aria-label={t('planner.duration')} value={r.durationMinutes} onChange={(e) => update(i, { durationMinutes: e.target.value })}>
              {[15, 30, 45, 60, 90, 120, 180].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </Select>
            <Select className="h-10" aria-label={t('planner.sessions')} value={r.sessions} onChange={(e) => update(i, { sessions: e.target.value })}>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>
                  {n}×
                </option>
              ))}
            </Select>
            <Select className="h-10" aria-label={t('tasks.preferredTime')} value={r.preferredTimeOfDay} onChange={(e) => update(i, { preferredTimeOfDay: e.target.value as ActivityRow['preferredTimeOfDay'] })}>
              {(['ANY', 'MORNING', 'AFTERNOON', 'EVENING'] as const).map((v) => (
                <option key={v} value={v}>
                  {t(`timeOfDay.${v}`)}
                </option>
              ))}
            </Select>
            <Select className="h-10" aria-label={t('planner.recovery')} value={r.recoveryHours} onChange={(e) => update(i, { recoveryHours: e.target.value })}>
              <option value="0">{t('planner.noRest')}</option>
              <option value="24">{t('planner.restDay')}</option>
              <option value="48">{t('planner.restTwoDays')}</option>
            </Select>
            <Button type="button" variant="ghost" size="icon" aria-label={t('planner.removeActivity')} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setRows((rs) => [...rs, emptyActivity()])}>
          <Plus className="h-4 w-4" aria-hidden />
          {t('planner.addActivity')}
        </Button>
        {errorFor(error, 'activities') ? (
          <p role="alert" className="text-[0.8125rem] text-critical">
            {errorFor(error, 'activities')}
          </p>
        ) : null}
      </fieldset>
      {general ? (
        <p role="alert" className="text-[0.875rem] text-critical">
          {general}
        </p>
      ) : null}
      <Button type="submit" className="self-start" loading={pending}>
        {pending ? null : <Sparkles className="h-4 w-4" aria-hidden />}
        {t('planner.build')}
      </Button>
    </form>
  );
}
