'use client';

import { type WorkoutDto, type WorkoutTypeValue } from '@lifeos/shared';
import { Badge, Button, EmptyState, ErrorState, Field, Input, ProgressRing, Select, Skeleton, Surface, Textarea } from '@lifeos/ui';
import { Dumbbell, Flame, Plus, Trash2, X } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { errorFor, fromLocalInput, Row, toLocalInput } from '@/components/ui/fields';
import { ConfirmDialog, PageHeader, Sheet } from '@/components/ui/sheet';
import { useI18n } from '@/i18n/i18n';
import { formatDuration } from '@/lib/format';
import { useCreateWorkout, useDeleteWorkout, useSportsStats, useUpdateWorkout, useWorkouts, useWorkoutTarget } from '@/lib/module-queries';

const TYPES: WorkoutTypeValue[] = ['STRENGTH', 'CARDIO', 'MOBILITY', 'SPORT', 'OTHER'];

export default function SportsPage() {
  const { t, locale } = useI18n();
  const stats = useSportsStats();
  const workouts = useWorkouts();
  const target = useWorkoutTarget();
  const [sheet, setSheet] = useState<{ open: boolean; workout: WorkoutDto | null }>({ open: false, workout: null });

  useEffect(() => {
    document.title = `${t('nav.sports')} · LifeOS`;
  }, [t]);

  const s = stats.data;
  const maxMinutes = Math.max(60, ...(s?.weeks.map((w) => w.minutes) ?? [0]));
  const weekFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });

  return (
    <div className="mx-auto w-full max-w-[960px] pt-4 sm:pt-6">
      <PageHeader
        title={t('nav.sports')}
        actions={
          <Button onClick={() => setSheet({ open: true, workout: null })}>
            <Plus className="h-4 w-4" aria-hidden />
            {t('sports.log')}
          </Button>
        }
      />

      {!s ? (
        <Skeleton className="mb-6 h-40" />
      ) : (
        <div className="mb-6 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <Surface className="flex items-center gap-5 p-5">
            <ProgressRing value={s.weeklyTarget ? s.thisWeek.sessions / s.weeklyTarget : 0} size={72} stroke={7} label={t('sports.thisWeek')} tone="positive" />
            <div className="min-w-0">
              <p className="text-[0.8125rem] font-medium text-secondary">{t('sports.thisWeek')}</p>
              <p className="text-[1.5rem] font-bold tabular-nums">
                {s.thisWeek.sessions} / {s.weeklyTarget}
              </p>
              <p className="text-[0.8125rem] text-secondary tabular-nums">{formatDuration(s.thisWeek.minutes, locale)}</p>
              {s.weekStreak ? (
                <p className="mt-1 inline-flex items-center gap-1 text-[0.8125rem] text-warning">
                  <Flame className="h-3.5 w-3.5" aria-hidden />
                  {t('habits.weekStreak', { count: s.weekStreak })}
                </p>
              ) : null}
              <label className="mt-2 flex items-center gap-2 text-[0.8125rem] text-secondary">
                {t('sports.target')}
                <Select className="h-8 w-auto py-0 text-[0.8125rem]" value={s.weeklyTarget} onChange={(e) => target.mutate(Number(e.target.value))}>
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
          </Surface>
          <Surface className="p-5">
            <p className="mb-3 text-[0.8125rem] font-medium text-secondary">{t('sports.last8Weeks')}</p>
            <div className="flex h-24 items-end gap-1.5" role="list" aria-label={t('sports.last8Weeks')}>
              {s.weeks.map((w) => (
                <div key={w.weekStart} role="listitem" className="group relative flex flex-1 flex-col items-center gap-1" title={`${weekFmt.format(new Date(`${w.weekStart}T12:00:00Z`))}: ${w.sessions} · ${formatDuration(w.minutes, locale)}`}>
                  <div
                    className="w-full max-w-7 rounded-t-[4px] bg-[color:var(--signal-positive)]"
                    style={{ height: `${Math.max(w.minutes ? 4 : 0, (w.minutes / maxMinutes) * 80)}px`, opacity: w.weekStart === s.weekStart ? 1 : 0.55 }}
                  />
                  <span className="sr-only">{`${weekFmt.format(new Date(`${w.weekStart}T12:00:00Z`))}: ${w.sessions}, ${formatDuration(w.minutes, locale)}`}</span>
                  <span aria-hidden className="text-[0.6875rem] tabular-nums text-tertiary">{w.sessions}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[0.8125rem] text-secondary">
              {s.daysSinceHardSession !== null && s.daysSinceHardSession < 2 ? t('sports.recoverHint') : s.lastWorkoutAt ? t('sports.readyHint') : t('sports.startHint')}
            </p>
          </Surface>
        </div>
      )}

      <Surface>
        {workouts.isPending ? (
          <div className="p-4"><Skeleton className="h-14" /></div>
        ) : workouts.isError ? (
          <ErrorState title={t('common.loadError')} onRetry={() => workouts.refetch()} />
        ) : !workouts.data?.length ? (
          <EmptyState icon={<Dumbbell className="h-8 w-8" strokeWidth={1.5} aria-hidden />} title={t('sports.empty')} description={t('sports.emptyDetail')} />
        ) : (
          <ul className="divide-y divide-separator">
            {workouts.data.map((w) => (
              <li key={w.id}>
                <button type="button" className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-sunken/50" onClick={() => setSheet({ open: true, workout: w })}>
                  <span className="w-24 shrink-0 text-[0.8125rem] text-secondary">
                    {new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(w.startAt))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{w.title}</span>
                    <span className="text-[0.8125rem] text-secondary">
                      {t(`workoutType.${w.type}`)} · {formatDuration(w.durationMinutes, locale)}
                      {w.exercises.length ? ` · ${t('sports.exercisesCount', { count: w.exercises.length })}` : ''}
                    </span>
                  </span>
                  {w.intensity ? <Badge tone={w.intensity >= 8 ? 'warning' : 'neutral'}>{t('sports.effort', { n: w.intensity })}</Badge> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Surface>
      <WorkoutSheet open={sheet.open} workout={sheet.workout} onOpenChange={(open) => setSheet((x) => ({ ...x, open }))} />
    </div>
  );
}

interface ExerciseRow {
  name: string;
  sets: string;
  reps: string;
  weightKg: string;
}

function WorkoutSheet({ open, workout, onOpenChange }: { open: boolean; workout: WorkoutDto | null; onOpenChange: (o: boolean) => void }) {
  const { t } = useI18n();
  const create = useCreateWorkout();
  const update = useUpdateWorkout();
  const remove = useDeleteWorkout();
  const [confirm, setConfirm] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<WorkoutTypeValue>('STRENGTH');
  const [start, setStart] = useState('');
  const [duration, setDuration] = useState('60');
  const [intensity, setIntensity] = useState('');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<ExerciseRow[]>([]);
  const mutation = workout ? update : create;

  useEffect(() => {
    if (!open) return;
    setTitle(workout?.title ?? '');
    setType(workout?.type ?? 'STRENGTH');
    setStart(toLocalInput(workout?.startAt ?? new Date().toISOString()));
    setDuration(String(workout?.durationMinutes ?? 60));
    setIntensity(workout?.intensity ? String(workout.intensity) : '');
    setNotes(workout?.notes ?? '');
    setRows((workout?.exercises ?? []).map((e) => ({ name: e.name, sets: e.sets?.toString() ?? '', reps: e.reps?.toString() ?? '', weightKg: e.weightKg?.toString() ?? '' })));
    create.reset();
    update.reset();
  }, [open, workout?.id]);

  const n = (v: string) => (v.trim() ? Number(v) : null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = {
      title,
      type,
      startAt: fromLocalInput(start) ?? new Date().toISOString(),
      durationMinutes: Number(duration),
      intensity: n(intensity),
      notes: notes.trim() || null,
      exercises: rows.filter((r) => r.name.trim()).map((r) => ({ name: r.name.trim(), sets: n(r.sets), reps: n(r.reps), weightKg: n(r.weightKg) })),
    };
    try {
      if (workout) await update.mutateAsync({ id: workout.id, ...body });
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
        title={workout ? t('sports.edit') : t('sports.log')}
        footer={
          <>
            {workout ? (
              <Button variant="ghost" className="mr-auto text-critical" onClick={() => setConfirm(true)}>
                <Trash2 className="h-4 w-4" aria-hidden />
                {t('common.delete')}
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button type="submit" form="workout-form" loading={mutation.isPending}>{workout ? t('common.save') : t('sports.save')}</Button>
          </>
        }
      >
        <form id="workout-form" className="flex flex-col gap-4" onSubmit={submit} noValidate>
          <Field label={t('tasks.title')} error={errorFor(mutation.error, 'title')}>{(p) => <Input {...p} autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
          <Row>
            <Field label={t('sports.type')}>
              {(p) => (
                <Select {...p} value={type} onChange={(e) => setType(e.target.value as WorkoutTypeValue)}>
                  {TYPES.map((x) => <option key={x} value={x}>{t(`workoutType.${x}`)}</option>)}
                </Select>
              )}
            </Field>
            <Field label={t('calendar.starts')}>{(p) => <Input {...p} type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
          </Row>
          <Row>
            <Field label={t('sports.duration')} error={errorFor(mutation.error, 'durationMinutes')}>
              {(p) => <Input {...p} type="number" min={1} max={1440} value={duration} onChange={(e) => setDuration(e.target.value)} />}
            </Field>
            <Field label={t('sports.intensity')} hint={t('sports.intensityHint')} error={errorFor(mutation.error, 'intensity')}>
              {(p) => <Input {...p} type="number" min={1} max={10} value={intensity} onChange={(e) => setIntensity(e.target.value)} />}
            </Field>
          </Row>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[0.8125rem] font-medium text-secondary">{t('sports.exercises')}</legend>
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_64px_64px_72px_auto] gap-1.5">
                <Input className="h-10" aria-label={t('sports.exercise')} placeholder={t('sports.exercise')} value={r.name} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <Input className="h-10 px-2" aria-label={t('sports.sets')} placeholder={t('sports.sets')} inputMode="numeric" value={r.sets} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, sets: e.target.value } : x)))} />
                <Input className="h-10 px-2" aria-label={t('sports.reps')} placeholder={t('sports.reps')} inputMode="numeric" value={r.reps} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, reps: e.target.value } : x)))} />
                <Input className="h-10 px-2" aria-label={t('sports.kg')} placeholder="kg" inputMode="decimal" value={r.weightKg} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, weightKg: e.target.value } : x)))} />
                <Button type="button" variant="ghost" size="icon" aria-label={t('sports.removeExercise')} onClick={() => setRows(rows.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setRows([...rows, { name: '', sets: '', reps: '', weightKg: '' }])}>
              <Plus className="h-4 w-4" aria-hidden />
              {t('sports.addExercise')}
            </Button>
            {errorFor(mutation.error) && !errorFor(mutation.error, 'title') ? <p role="alert" className="text-[0.8125rem] text-critical">{errorFor(mutation.error)}</p> : null}
          </fieldset>
          <Field label={t('tasks.notes')}>{(p) => <Textarea {...p} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
        </form>
      </Sheet>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t('sports.deleteTitle')}
        description={t('calendar.deleteBody')}
        confirmLabel={t('common.delete')}
        pending={remove.isPending}
        onConfirm={async () => {
          if (!workout) return;
          await remove.mutateAsync(workout.id);
          setConfirm(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}
