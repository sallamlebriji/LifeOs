'use client';

import { type TaskDto } from '@lifeos/shared';
import { Badge, CheckCircle, cn } from '@lifeos/ui';
import { CalendarClock, Clock, ListChecks, Pin, Repeat } from 'lucide-react';
import { CategoryDot, PriorityBadge } from '@/components/ui/fields';
import { useI18n } from '@/i18n/i18n';
import { formatDuration } from '@/lib/format';
import { useTaskStatus } from '@/lib/module-queries';

function dueLabel(task: TaskDto, locale: string, now: Date) {
  if (!task.dueAt) return null;
  const due = new Date(task.dueAt);
  const sameDay = due.toDateString() === now.toDateString();
  const fmt = new Intl.DateTimeFormat(locale, sameDay ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : { day: 'numeric', month: 'short' });
  return { text: fmt.format(due), overdue: due < now && task.status !== 'COMPLETED' && task.status !== 'CANCELLED' };
}

export function TaskRow({ task, onOpen }: { task: TaskDto; onOpen: (id: string) => void }) {
  const { t, locale } = useI18n();
  const status = useTaskStatus();
  const done = task.status === 'COMPLETED';
  const due = dueLabel(task, locale, new Date());
  const planned = task.plannedDate
    ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${task.plannedDate}T12:00:00Z`))
    : null;

  return (
    <li className="group flex items-start gap-3 px-4 py-2.5">
      <CheckCircle
        className="mt-0.5"
        checked={done}
        label={t(done ? 'today.markUndone' : 'today.markDone', { title: task.title })}
        onClick={() => status.mutate({ id: task.id, status: done ? 'TODO' : 'COMPLETED' })}
      />
      <button
        type="button"
        onClick={() => onOpen(task.id)}
        className="min-w-0 flex-1 rounded-sm py-0.5 text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40"
      >
        <span className={cn('block text-[0.9375rem] leading-snug', done && 'text-tertiary line-through', task.status === 'CANCELLED' && 'text-tertiary')}>
          {task.title}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-secondary">
          <PriorityBadge priority={task.priority} />
          {task.status === 'IN_PROGRESS' ? <Badge tone="accent">{t('status.IN_PROGRESS')}</Badge> : null}
          {due ? (
            <span className={cn('inline-flex items-center gap-1', due.overdue && 'font-medium text-critical')}>
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {due.overdue ? t('today.overdue') + ' · ' : ''}
              {due.text}
            </span>
          ) : null}
          {planned && !due ? (
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden />
              {planned}
            </span>
          ) : null}
          {task.schedulingMode === 'FIXED' ? (
            <span className="inline-flex items-center gap-1">
              <Pin className="h-3.5 w-3.5" aria-hidden />
              {t('tasks.fixed')}
            </span>
          ) : null}
          {task.recurrenceRule ? <Repeat className="h-3.5 w-3.5" aria-label={t('tasks.repeats')} /> : null}
          {task.subtaskCount ? (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <ListChecks className="h-3.5 w-3.5" aria-hidden />
              {task.subtasksDone}/{task.subtaskCount}
            </span>
          ) : null}
          {task.project ? <span>{task.project.name}</span> : null}
          <CategoryDot category={task.category} />
          {task.estimatedMinutes ? <span className="tabular-nums">{formatDuration(task.estimatedMinutes, locale)}</span> : null}
        </span>
      </button>
    </li>
  );
}
