'use client';

import {
  type FreeSlot,
  type Insight,
  type MyDayEvent,
  type MyDayGoal,
  type MyDayHabit,
  type MyDayResponse,
  type MyDayTask,
  type PriorityValue,
} from '@lifeos/shared';
import { quickAddTaskSchema } from '@lifeos/validation';
import { Badge, Button, cn, EmptyState, ProgressBar, SectionHeader, Surface } from '@lifeos/ui';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  CalendarCheck,
  Check,
  CircleCheckBig,
  Flame,
  Info,
  Lock,
  MapPin,
  Plus,
  Repeat,
  Sparkles,
} from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useI18n } from '@/i18n/i18n';
import { ApiError } from '@/lib/api';
import { formatDuration, formatTime } from '@/lib/format';
import { useQuickAddTask, useSetTaskStatus, useToggleHabit } from '@/lib/queries';

const PRIORITY_TONE: Record<PriorityValue, 'critical' | 'warning' | 'accent' | 'neutral'> = {
  URGENT: 'critical',
  HIGH: 'warning',
  MEDIUM: 'neutral',
  LOW: 'neutral',
};
const PRIORITY_LABEL: Record<PriorityValue, string> = {
  URGENT: 'Urgent',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
};

function CategoryDot({ color, name }: { color: string; name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[0.8125rem] text-secondary">
      <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: color }} />
      {name}
    </span>
  );
}

// ─── Focus tiles: top priority + next up ────────────────────────────────

export function FocusTiles({ day, now }: { day: MyDayResponse; now: Date }) {
  const { t, locale } = useI18n();
  const top = day.topPriority;
  const next = day.nextUp;
  const happening = next && new Date(next.startAt).getTime() <= now.getTime();

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Surface className="p-5">
        <p className="flex items-center gap-1.5 text-[0.8125rem] font-medium text-secondary">
          <Flame aria-hidden className="h-4 w-4 text-critical" /> {t('today.topPriority')}
        </p>
        {top ? (
          <>
            <p className="mt-2 text-[1.1875rem] font-semibold leading-snug tracking-[-0.015em]">{top.title}</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <Badge tone={top.overdue ? 'critical' : PRIORITY_TONE[top.priority]}>
                {top.overdue ? t('today.overdue') : PRIORITY_LABEL[top.priority]}
              </Badge>
              {top.estimatedMinutes ? (
                <span className="text-[0.8125rem] text-secondary tabular">{formatDuration(top.estimatedMinutes, locale)}</span>
              ) : null}
              {top.dueAt && !top.overdue ? (
                <span className="text-[0.8125rem] text-secondary tabular">
                  {t('today.due', { time: formatTime(top.dueAt, day.timezone, locale) })}
                </span>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-[1.1875rem] font-semibold tracking-[-0.015em]">{t('today.noPriority')}</p>
            <p className="mt-1 text-[0.875rem] text-secondary">{t('today.noPriorityDetail')}</p>
          </>
        )}
      </Surface>
      <Surface className="p-5">
        <p className="flex items-center gap-1.5 text-[0.8125rem] font-medium text-secondary">
          <CalendarCheck aria-hidden className="h-4 w-4 text-accent" />
          {happening ? t('today.nowHappening') : t('today.nextUp')}
        </p>
        {next ? (
          <>
            <p className="mt-2 text-[1.1875rem] font-semibold leading-snug tracking-[-0.015em]">{next.title}</p>
            <p className="mt-2.5 text-[0.875rem] text-secondary tabular">
              {formatTime(next.startAt, day.timezone, locale)} – {formatTime(next.endAt, day.timezone, locale)}
              {next.location ? ` · ${next.location}` : ''}
            </p>
          </>
        ) : (
          <>
            <p className="mt-2 text-[1.1875rem] font-semibold tracking-[-0.015em]">{t('today.agendaEmpty')}</p>
            <p className="mt-1 text-[0.875rem] text-secondary">{t('today.agendaEmptyDetail')}</p>
          </>
        )}
      </Surface>
    </div>
  );
}

// ─── Tasks ───────────────────────────────────────────────────────────────

export function QuickAdd({ plannedDate }: { plannedDate: string }) {
  const { t } = useI18n();
  const add = useQuickAddTask();
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string>();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = quickAddTaskSchema.safeParse({ title, plannedDate });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    try {
      await add.mutateAsync({ title: parsed.data.title, plannedDate });
      setTitle('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Couldn’t add the task. Try again.');
    }
  }

  return (
    <form onSubmit={submit} className="border-t border-separator px-4 py-2.5" noValidate>
      <div className="flex items-center gap-2">
        <Plus aria-hidden className="h-[18px] w-[18px] shrink-0 text-tertiary" />
        <label htmlFor="quick-add" className="sr-only">
          {t('today.quickAdd')}
        </label>
        <input
          id="quick-add"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('today.quickAddPlaceholder')}
          maxLength={300}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'quick-add-error' : undefined}
          className="h-9 min-w-0 flex-1 bg-transparent text-[0.9375rem] outline-none placeholder:text-tertiary"
        />
        {title.trim() ? (
          <Button type="submit" size="sm" loading={add.isPending}>
            {t('today.quickAdd')}
          </Button>
        ) : null}
      </div>
      {error ? (
        <p id="quick-add-error" role="alert" className="pb-1 pl-7 text-[0.8125rem] text-critical">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function TaskRow({ task, date, timezone }: { task: MyDayTask; date?: string; timezone: string }) {
  const { t, locale } = useI18n();
  const setStatus = useSetTaskStatus(date);
  const done = task.status === 'COMPLETED';
  return (
    <motion.li layout="position" className="flex items-start gap-3 px-4 py-3">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={t(done ? 'today.markUndone' : 'today.markDone', { title: task.title })}
        onClick={() => setStatus.mutate({ id: task.id, status: done ? 'TODO' : 'COMPLETED' })}
        className={cn(
          'mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-[var(--duration-fast)]',
          done ? 'border-positive bg-positive text-white' : 'border-separator-strong hover:border-accent',
        )}
      >
        {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> : null}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn('text-[0.9375rem] leading-snug', done && 'text-tertiary line-through decoration-1')}>{task.title}</p>
        {!done ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            {task.overdue ? <Badge tone="critical">{t('today.overdue')}</Badge> : null}
            {task.priority === 'URGENT' || task.priority === 'HIGH' ? (
              <Badge tone={PRIORITY_TONE[task.priority]}>{PRIORITY_LABEL[task.priority]}</Badge>
            ) : null}
            {task.category ? <CategoryDot color={task.category.color} name={task.category.name} /> : null}
            {task.project ? <span className="text-[0.8125rem] text-secondary">{task.project.name}</span> : null}
            {task.estimatedMinutes ? (
              <span className="text-[0.8125rem] text-secondary tabular">{formatDuration(task.estimatedMinutes, locale)}</span>
            ) : null}
            {task.dueAt && !task.overdue ? (
              <span className="text-[0.8125rem] text-secondary tabular">
                {t('today.due', { time: formatTime(task.dueAt, timezone, locale) })}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </motion.li>
  );
}

export function TasksSection({ day, date }: { day: MyDayResponse; date?: string }) {
  const { t } = useI18n();
  const { tasksCompleted, tasksTotal } = day.stats;
  return (
    <section aria-labelledby="tasks-heading">
      <SectionHeader
        id="tasks-heading"
        title={t('today.tasks')}
        detail={tasksTotal ? <span className="tabular">{t('today.tasksProgress', { done: tasksCompleted, total: tasksTotal })}</span> : null}
      />
      <Surface className="overflow-hidden">
        {tasksTotal ? <ProgressBar value={tasksCompleted / tasksTotal} label={t('today.tasks')} className="h-[3px] rounded-none" /> : null}
        {day.tasks.length ? (
          <ul className="divide-y divide-separator">
            <AnimatePresence initial={false}>
              {day.tasks.map((task) => (
                <TaskRow key={task.id} task={task} date={date} timezone={day.timezone} />
              ))}
            </AnimatePresence>
          </ul>
        ) : (
          <EmptyState
            icon={<CircleCheckBig className="h-7 w-7" strokeWidth={1.5} aria-hidden />}
            title={t('today.tasksEmpty')}
            description={t('today.tasksEmptyDetail')}
          />
        )}
        <QuickAdd plannedDate={day.date} />
      </Surface>
    </section>
  );
}

// ─── Agenda ──────────────────────────────────────────────────────────────

function AgendaRow({ event, timezone, now }: { event: MyDayEvent; timezone: string; now: Date }) {
  const { t, locale } = useI18n();
  const past = new Date(event.endAt).getTime() <= now.getTime();
  return (
    <li className={cn('flex gap-4 px-4 py-3', past && 'opacity-55')}>
      <div className="w-[3.25rem] shrink-0 pt-px text-right text-[0.8125rem] text-secondary tabular">
        {event.allDay ? 'All day' : formatTime(event.startAt, timezone, locale)}
      </div>
      <div
        aria-hidden
        className="w-[3px] shrink-0 self-stretch rounded-full"
        style={{ background: event.category?.color ?? 'var(--separator-strong)' }}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[0.9375rem] font-medium leading-snug">{event.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.8125rem] text-secondary">
          {!event.allDay ? (
            <span className="tabular">
              {formatTime(event.startAt, timezone, locale)} – {formatTime(event.endAt, timezone, locale)}
            </span>
          ) : null}
          {event.category ? <span>{event.category.name}</span> : null}
          {event.location ? (
            <span className="inline-flex items-center gap-1">
              <MapPin aria-hidden className="h-3.5 w-3.5" />
              {event.location}
            </span>
          ) : null}
          {event.locked ? (
            <span className="inline-flex items-center gap-1">
              <Lock aria-hidden className="h-3.5 w-3.5" />
              {t('today.locked')}
            </span>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function AgendaSection({ day, now }: { day: MyDayResponse; now: Date }) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="agenda-heading">
      <SectionHeader id="agenda-heading" title={t('today.agenda')} />
      <Surface className="overflow-hidden">
        {day.agenda.length ? (
          <ul className="divide-y divide-separator">
            {day.agenda.map((e) => (
              <AgendaRow key={`${e.kind}-${e.id}`} event={e} timezone={day.timezone} now={now} />
            ))}
          </ul>
        ) : (
          <EmptyState title={t('today.agendaEmpty')} description={t('today.agendaEmptyDetail')} />
        )}
      </Surface>
    </section>
  );
}

// ─── Insights ────────────────────────────────────────────────────────────

const INSIGHT_ICON = { warning: AlertTriangle, info: Info, positive: Sparkles } as const;
const INSIGHT_TONE = { warning: 'text-warning', info: 'text-accent', positive: 'text-positive' } as const;

export function InsightsSection({ insights }: { insights: Insight[] }) {
  const { t } = useI18n();
  if (!insights.length) return null;
  return (
    <section aria-labelledby="insights-heading">
      <SectionHeader id="insights-heading" title={t('today.insights')} />
      <Surface>
        <ul className="divide-y divide-separator">
          {insights.map((i) => {
            const Icon = INSIGHT_ICON[i.tone];
            return (
              <li key={i.id} className="flex gap-3 px-4 py-3.5">
                <Icon aria-hidden className={cn('mt-0.5 h-[18px] w-[18px] shrink-0', INSIGHT_TONE[i.tone])} />
                <div>
                  <p className="text-[0.9375rem] font-medium leading-snug">{i.title}</p>
                  <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-secondary">{i.detail}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </Surface>
    </section>
  );
}

// ─── Habits ──────────────────────────────────────────────────────────────

export function HabitsSection({ habits, dateKey, queryDate }: { habits: MyDayHabit[]; dateKey: string; queryDate?: string }) {
  const { t } = useI18n();
  const toggle = useToggleHabit(queryDate);
  const done = habits.filter((h) => h.doneToday).length;
  return (
    <section aria-labelledby="habits-heading">
      <SectionHeader
        id="habits-heading"
        title={t('today.habits')}
        detail={habits.length ? <span className="tabular">{done}/{habits.length}</span> : null}
      />
      <Surface>
        {habits.length ? (
          <ul className="divide-y divide-separator">
            {habits.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={h.doneToday}
                  onClick={() => toggle.mutate({ id: h.id, date: dateKey, done: !h.doneToday })}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-sunken/60"
                >
                  <span
                    aria-hidden
                    className={cn(
                      'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] border-[1.5px] transition-colors',
                      h.doneToday ? 'border-transparent text-white' : 'border-separator-strong',
                    )}
                    style={h.doneToday ? { background: h.color ?? 'var(--signal-positive)' } : undefined}
                  >
                    {h.doneToday ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[0.9375rem]">{h.name}</span>
                  {h.streak > 0 ? (
                    <span className="inline-flex items-center gap-1 text-[0.8125rem] text-secondary tabular">
                      <Flame aria-hidden className="h-3.5 w-3.5 text-warning" />
                      <span className="sr-only">{t('today.streak', { count: h.streak })}</span>
                      <span aria-hidden>{h.streak}</span>
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<Repeat className="h-7 w-7" strokeWidth={1.5} aria-hidden />}
            title={t('today.habitsEmpty')}
            description={t('today.habitsEmptyDetail')}
          />
        )}
      </Surface>
    </section>
  );
}

// ─── Goals ───────────────────────────────────────────────────────────────

export function GoalsSection({ goals }: { goals: MyDayGoal[] }) {
  const { t } = useI18n();
  if (!goals.length) return null;
  return (
    <section aria-labelledby="goals-heading">
      <SectionHeader id="goals-heading" title={t('today.goals')} />
      <Surface>
        <ul className="divide-y divide-separator">
          {goals.map((g) => (
            <li key={g.id} className="px-4 py-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-[0.9375rem] font-medium">{g.title}</p>
                {g.progress !== null ? (
                  <span className="text-[0.8125rem] text-secondary tabular">{Math.round(g.progress * 100)}%</span>
                ) : null}
              </div>
              {g.progress !== null ? <ProgressBar value={g.progress} label={g.title} className="mt-2" /> : null}
            </li>
          ))}
        </ul>
      </Surface>
    </section>
  );
}

// ─── Free slots ──────────────────────────────────────────────────────────

export function FreeSlotsSection({ slots, timezone, minSession }: { slots: FreeSlot[]; timezone: string; minSession: number }) {
  const { t, locale } = useI18n();
  return (
    <section aria-labelledby="free-heading">
      <SectionHeader id="free-heading" title={t('today.freeSlots')} />
      <Surface>
        {slots.length ? (
          <ul className="divide-y divide-separator">
            {slots.map((s) => (
              <li key={s.start} className="flex items-center justify-between px-4 py-3 text-[0.9375rem] tabular">
                <span>
                  {formatTime(s.start, timezone, locale)} – {formatTime(s.end, timezone, locale)}
                </span>
                <span className="text-[0.8125rem] text-secondary">{formatDuration(s.minutes, locale)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-4 text-[0.875rem] text-secondary">{t('today.freeSlotsEmpty', { min: minSession })}</p>
        )}
      </Surface>
    </section>
  );
}
