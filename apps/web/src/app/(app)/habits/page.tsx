'use client';

import { addDaysKey, type HabitDto, isHabitDue } from '@lifeos/shared';
import { Button, cn, EmptyState, ErrorState, Field, Input, Segmented, Select, Skeleton, Surface, Textarea } from '@lifeos/ui';
import { Archive, ArchiveRestore, Check, Flame, Plus, Repeat, Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { zonedParts } from '@/components/calendar/calendar-model';
import { CategorySelect, errorFor, Row } from '@/components/ui/fields';
import { ConfirmDialog, PageHeader, Sheet } from '@/components/ui/sheet';
import { useI18n } from '@/i18n/i18n';
import { useCreateHabit, useDeleteHabit, useHabitDay, useHabits, useUpdateHabit } from '@/lib/module-queries';
import { useMe } from '@/lib/queries';

const COLORS = ['#30D158', '#0A84FF', '#FF9F0A', '#BF5AF2', '#FF375F', '#64D2FF'];

export default function HabitsPage() {
  const { t, locale } = useI18n();
  const me = useMe();
  const tz = me.data?.preferences?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = zonedParts(new Date(), tz).dateKey;
  const [archived, setArchived] = useState(false);
  const habits = useHabits(archived);
  const toggle = useHabitDay();
  const [sheet, setSheet] = useState<{ open: boolean; habit: HabitDto | null }>({ open: false, habit: null });
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysKey(today, i - 6)), [today]);
  const dayFmt = new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' });
  const fullFmt = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

  useEffect(() => {
    document.title = `${t('nav.habits')} · LifeOS`;
  }, [t]);

  const items = habits.data ?? [];

  return (
    <div className="mx-auto w-full max-w-[880px] pt-4 sm:pt-6">
      <PageHeader
        title={t('nav.habits')}
        actions={
          <Button onClick={() => setSheet({ open: true, habit: null })}>
            <Plus className="h-4 w-4" aria-hidden />
            {t('habits.new')}
          </Button>
        }
      />
      <Segmented
        className="mb-5"
        label={t('tasks.show')}
        value={archived ? 'archived' : 'active'}
        onChange={(v) => setArchived(v === 'archived')}
        options={[
          { value: 'active', label: t('habits.active') },
          { value: 'archived', label: t('habits.archived') },
        ]}
      />

      <Surface>
        {habits.isPending ? (
          <div className="flex flex-col gap-3 p-4">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : habits.isError ? (
          <ErrorState title={t('common.loadError')} onRetry={() => habits.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Repeat className="h-8 w-8" strokeWidth={1.5} aria-hidden />}
            title={archived ? t('habits.noneArchived') : t('habits.empty')}
            description={archived ? undefined : t('habits.emptyDetail')}
          />
        ) : (
          <>
            {!archived ? (
              <div className="hidden items-center gap-4 border-b border-separator px-4 py-2 sm:flex" aria-hidden>
                <span className="flex-1" />
                <span className="grid grid-cols-7 gap-1">
                  {week.map((d) => (
                    <span key={d} className={cn('w-9 text-center text-[0.75rem] font-medium', d === today ? 'text-accent' : 'text-tertiary')}>
                      {dayFmt.format(new Date(`${d}T12:00:00Z`))}
                    </span>
                  ))}
                </span>
              </div>
            ) : null}
            <ul className="divide-y divide-separator">
              {items.map((h) => {
                const color = h.color ?? h.category?.color ?? 'var(--signal-positive)';
                const schedule = { frequency: h.frequency, daysOfWeek: h.daysOfWeek, timesPerWeek: h.timesPerWeek };
                return (
                  <li key={h.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                    <button
                      type="button"
                      onClick={() => setSheet({ open: true, habit: h })}
                      className="min-w-0 flex-1 rounded-sm text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40"
                    >
                      <span className="flex items-center gap-2 font-medium">
                        <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                        {h.name}
                      </span>
                      <span className="mt-0.5 flex flex-wrap gap-x-3 text-[0.8125rem] text-secondary">
                        <span>{describeSchedule(h, t, locale)}</span>
                        {h.stats.currentStreak ? (
                          <span className="inline-flex items-center gap-1 text-warning">
                            <Flame className="h-3.5 w-3.5" aria-hidden />
                            {t(h.timesPerWeek && !h.daysOfWeek?.length ? 'habits.weekStreak' : 'today.streak', { count: h.stats.currentStreak })}
                          </span>
                        ) : null}
                        <span className="tabular-nums">{t('habits.consistency', { pct: Math.round(h.stats.consistency28 * 100) })}</span>
                        {h.reminderTime ? <span className="tabular-nums">⏰ {h.reminderTime}</span> : null}
                      </span>
                    </button>
                    {!archived ? (
                      <div className="grid grid-cols-7 gap-1" role="group" aria-label={t('habits.lastSevenDays', { name: h.name })}>
                        {week.map((d) => {
                          const done = h.recent.includes(d);
                          const due = isHabitDue(schedule, d);
                          return (
                            <button
                              key={d}
                              type="button"
                              role="checkbox"
                              aria-checked={done}
                              aria-label={`${h.name}, ${fullFmt.format(new Date(`${d}T12:00:00Z`))}`}
                              onClick={() => toggle.mutate({ id: h.id, date: d, done: !done })}
                              className={cn(
                                'flex h-9 w-9 items-center justify-center rounded-full border-[1.5px] transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40',
                                done ? 'border-transparent' : due ? 'border-[color:var(--content-tertiary)]' : 'border-dashed border-separator',
                                d === today && !done && 'border-accent',
                              )}
                              style={done ? { background: color } : undefined}
                            >
                              {done ? <Check className="h-4 w-4 text-white" strokeWidth={3} aria-hidden /> : (
                                <span className="text-[0.6875rem] tabular-nums text-tertiary sm:hidden" aria-hidden>
                                  {Number(d.slice(8))}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Surface>
      <p className="mt-3 px-1 text-[0.8125rem] text-tertiary">{t('habits.remindersNote')}</p>

      <HabitSheet open={sheet.open} habit={sheet.habit} onOpenChange={(open) => setSheet((s) => ({ ...s, open }))} />
    </div>
  );
}

function weekdayNames(locale: string) {
  // 2026-11-15 is a Sunday.
  return Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(`2026-11-${15 + i}T12:00:00Z`)),
  );
}

function describeSchedule(h: HabitDto, t: ReturnType<typeof useI18n>['t'], locale: string) {
  if (h.frequency === 'DAILY') return t('habits.daily');
  if (h.daysOfWeek?.length) {
    const names = weekdayNames(locale);
    return [...h.daysOfWeek].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => names[d]).join(' · ');
  }
  return t('habits.timesPerWeek', { count: h.timesPerWeek ?? 1 });
}

interface Form {
  name: string;
  description: string;
  mode: 'DAILY' | 'DAYS' | 'TIMES';
  daysOfWeek: number[];
  timesPerWeek: string;
  reminderTime: string;
  color: string;
  categoryId: string | null;
}

const toForm = (h: HabitDto | null): Form => ({
  name: h?.name ?? '',
  description: h?.description ?? '',
  mode: !h || h.frequency === 'DAILY' ? 'DAILY' : h.daysOfWeek?.length ? 'DAYS' : 'TIMES',
  daysOfWeek: h?.daysOfWeek ?? [1, 3, 5],
  timesPerWeek: String(h?.timesPerWeek ?? 3),
  reminderTime: h?.reminderTime ?? '',
  color: h?.color ?? COLORS[0]!,
  categoryId: h?.category?.id ?? null,
});

function HabitSheet({ open, habit, onOpenChange }: { open: boolean; habit: HabitDto | null; onOpenChange: (o: boolean) => void }) {
  const { t, locale } = useI18n();
  const [form, setForm] = useState<Form>(() => toForm(habit));
  const create = useCreateHabit();
  const update = useUpdateHabit();
  const remove = useDeleteHabit();
  const [confirm, setConfirm] = useState(false);
  const mutation = habit ? update : create;
  const err = (f: string) => errorFor(mutation.error, f);
  const names = weekdayNames(locale);

  useEffect(() => {
    if (open) {
      setForm(toForm(habit));
      create.reset();
      update.reset();
    }
  }, [open, habit?.id]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = {
      name: form.name,
      description: form.description.trim() || null,
      frequency: form.mode === 'DAILY' ? ('DAILY' as const) : form.mode === 'DAYS' ? ('WEEKLY' as const) : ('CUSTOM' as const),
      daysOfWeek: form.mode === 'DAYS' ? form.daysOfWeek : null,
      timesPerWeek: form.mode === 'TIMES' ? Number(form.timesPerWeek) : null,
      reminderTime: form.reminderTime || null,
      color: form.color,
      categoryId: form.categoryId,
    };
    try {
      if (habit) await update.mutateAsync({ id: habit.id, ...body });
      else await create.mutateAsync(body);
      onOpenChange(false);
    } catch {
      /* inline */
    }
  }

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        title={habit ? t('habits.edit') : t('habits.new')}
        footer={
          <>
            {habit ? (
              <>
                <Button variant="ghost" className="text-critical" onClick={() => setConfirm(true)}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                  {t('common.delete')}
                </Button>
                <Button
                  variant="ghost"
                  className="mr-auto"
                  loading={update.isPending && update.variables?.archived !== undefined}
                  onClick={async () => {
                    await update.mutateAsync({ id: habit.id, archived: !habit.archived });
                    onOpenChange(false);
                  }}
                >
                  {habit.archived ? <ArchiveRestore className="h-4 w-4" aria-hidden /> : <Archive className="h-4 w-4" aria-hidden />}
                  {habit.archived ? t('habits.restore') : t('habits.archive')}
                </Button>
              </>
            ) : null}
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="habit-form" loading={mutation.isPending && update.variables?.archived === undefined}>
              {habit ? t('common.save') : t('habits.create')}
            </Button>
          </>
        }
      >
        <form id="habit-form" className="flex flex-col gap-4" onSubmit={submit} noValidate>
          <Field label={t('habits.name')} error={err('name')}>
            {(p) => <Input {...p} autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} />}
          </Field>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1.5 text-[0.8125rem] font-medium text-secondary">{t('habits.frequency')}</legend>
            <Segmented
              label={t('habits.frequency')}
              value={form.mode}
              onChange={(v) => set('mode', v)}
              options={[
                { value: 'DAILY', label: t('habits.daily') },
                { value: 'DAYS', label: t('habits.specificDays') },
                { value: 'TIMES', label: t('habits.perWeek') },
              ]}
            />
            {form.mode === 'DAYS' ? (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('habits.specificDays')}>
                {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                  const on = form.daysOfWeek.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set('daysOfWeek', on ? form.daysOfWeek.filter((x) => x !== d) : [...form.daysOfWeek, d])}
                      className={cn(
                        'h-10 min-w-11 rounded-md px-2 text-[0.875rem] font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40',
                        on ? 'bg-accent text-on-accent' : 'bg-sunken text-secondary hover:text-primary',
                      )}
                    >
                      {names[d]}
                    </button>
                  );
                })}
              </div>
            ) : null}
            {form.mode === 'TIMES' ? (
              <Select aria-label={t('habits.perWeek')} value={form.timesPerWeek} onChange={(e) => set('timesPerWeek', e.target.value)}>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {t('habits.timesPerWeek', { count: n })}
                  </option>
                ))}
              </Select>
            ) : null}
            {err('daysOfWeek') || err('timesPerWeek') ? (
              <p role="alert" className="text-[0.8125rem] text-critical">
                {err('daysOfWeek') ?? err('timesPerWeek')}
              </p>
            ) : null}
          </fieldset>
          <Row>
            <Field label={t('habits.reminder')} hint={t('habits.reminderHint')} error={err('reminderTime')}>
              {(p) => <Input {...p} type="time" value={form.reminderTime} onChange={(e) => set('reminderTime', e.target.value)} />}
            </Field>
            <Field label={t('tasks.category')}>{(p) => <CategorySelect id={p.id} value={form.categoryId} onChange={(v) => set('categoryId', v)} />}</Field>
          </Row>
          <fieldset>
            <legend className="mb-1.5 text-[0.8125rem] font-medium text-secondary">{t('projects.color')}</legend>
            <div className="flex gap-2" role="radiogroup" aria-label={t('projects.color')}>
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={form.color === c}
                  aria-label={c}
                  onClick={() => set('color', c)}
                  className="flex h-9 w-9 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40"
                >
                  <span className="h-6 w-6 rounded-full" style={{ background: c, boxShadow: form.color === c ? `0 0 0 2px var(--surface-raised), 0 0 0 4px ${c}` : undefined }} />
                </button>
              ))}
            </div>
          </fieldset>
          <Field label={t('goals.description')}>{(p) => <Textarea {...p} value={form.description} onChange={(e) => set('description', e.target.value)} />}</Field>
        </form>
        {habit ? (
          <dl className="mt-6 grid grid-cols-2 gap-3 text-[0.875rem]">
            {(
              [
                ['habits.currentStreak', habit.stats.currentStreak],
                ['habits.longestStreak', habit.stats.longestStreak],
                ['habits.thisWeek', `${habit.stats.completedThisWeek} / ${habit.stats.dueThisWeek}`],
                ['habits.total', habit.stats.totalCompletions],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="rounded-md bg-sunken/60 px-3 py-2">
                <dt className="text-[0.75rem] text-secondary">{t(k)}</dt>
                <dd className="text-[1.0625rem] font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </Sheet>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t('habits.deleteTitle')}
        description={t('habits.deleteBody')}
        confirmLabel={t('common.delete')}
        pending={remove.isPending}
        onConfirm={async () => {
          if (!habit) return;
          await remove.mutateAsync(habit.id);
          setConfirm(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}

