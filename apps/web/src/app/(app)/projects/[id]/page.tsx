'use client';

import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { type TaskDto, type TaskStatusValue } from '@lifeos/shared';
import { Badge, Button, cn, ErrorState, Input, ProgressRing, Skeleton, Surface } from '@lifeos/ui';
import { ChevronLeft, Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Milestones } from '@/components/goals/milestones';
import { ProjectSheet } from '@/components/projects/project-sheet';
import { TaskSheet } from '@/components/tasks/task-sheet';
import { PriorityBadge } from '@/components/ui/fields';
import { useI18n } from '@/i18n/i18n';
import { ApiError } from '@/lib/api';
import { formatDuration } from '@/lib/format';
import { useCreateTask, useProject, useTasks, useTaskStatus } from '@/lib/module-queries';

const COLUMNS: TaskStatusValue[] = ['TODO', 'IN_PROGRESS', 'COMPLETED'];

export default function ProjectPage() {
  const { t, locale } = useI18n();
  const { id } = useParams<{ id: string }>();
  const project = useProject(id);
  const tasks = useTasks({ projectId: id, sort: 'manual', limit: 100 });
  const status = useTaskStatus();
  const [overrides, setOverrides] = useState<Record<string, TaskStatusValue>>({});
  const [editing, setEditing] = useState(false);
  const [taskSheet, setTaskSheet] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [moveError, setMoveError] = useState<string>();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  useEffect(() => {
    if (project.data) document.title = `${project.data.name} · LifeOS`;
  }, [project.data]);

  if (project.isError) {
    const notFound = project.error instanceof ApiError && project.error.status === 404;
    return (
      <Surface className="mx-auto mt-8 max-w-xl">
        <ErrorState title={notFound ? t('projects.notFound') : t('common.loadError')} onRetry={notFound ? undefined : () => project.refetch()} />
      </Surface>
    );
  }
  const p = project.data;
  const all = (tasks.data?.pages.flatMap((pg) => pg.items) ?? []).map((task) =>
    overrides[task.id] ? { ...task, status: overrides[task.id]! } : task,
  );

  function onDragEnd(e: DragEndEvent) {
    const taskId = String(e.active.id);
    const to = e.over?.id as TaskStatusValue | undefined;
    const task = all.find((x) => x.id === taskId);
    if (!to || !task || task.status === to) return;
    setMoveError(undefined);
    setOverrides((o) => ({ ...o, [taskId]: to }));
    status.mutate(
      { id: taskId, status: to },
      {
        onError: (err) => setMoveError(err instanceof ApiError ? err.message : t('common.loadError')),
        onSettled: () => setOverrides((o) => {
          const { [taskId]: _drop, ...rest } = o;
          return rest;
        }),
      },
    );
  }

  const total = p ? p.taskCounts.TODO + p.taskCounts.IN_PROGRESS + p.taskCounts.COMPLETED : 0;

  return (
    <div className="mx-auto w-full max-w-[1200px] pt-4 sm:pt-6">
      <Link href="/projects" className="mb-2 inline-flex items-center gap-1 text-[0.875rem] text-accent hover:underline">
        <ChevronLeft className="h-4 w-4" aria-hidden />
        {t('nav.projects')}
      </Link>
      {!p ? (
        <Skeleton className="h-24" />
      ) : (
        <header className="mb-6 flex flex-wrap items-center gap-4">
          <ProgressRing value={total ? p.taskCounts.COMPLETED / total : 0} label={t('projects.progress')} size={52} />
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 font-display text-[1.75rem] font-bold leading-tight tracking-[-0.02em]">
              <span aria-hidden className="h-3.5 w-3.5 shrink-0 rounded-[4px]" style={{ background: p.color ?? 'var(--content-tertiary)' }} />
              <span className="truncate">{p.name}</span>
            </h1>
            <p className="mt-1 flex flex-wrap gap-x-3 text-[0.875rem] text-secondary">
              <span>{t(`projectStatus.${p.status}`)}</span>
              <span className="tabular-nums">{t('projects.tasksDone', { done: p.taskCounts.COMPLETED, total })}</span>
              <span className="tabular-nums">
                {t('projects.tracked', { time: formatDuration(p.trackedMinutes, locale) })}
                {p.estimatedMinutes ? ` / ${formatDuration(p.estimatedMinutes, locale)}` : ''}
              </span>
            </p>
          </div>
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" aria-hidden />
            {t('projects.edit')}
          </Button>
        </header>
      )}

      {moveError ? (
        <p role="alert" className="mb-3 rounded-md bg-critical-soft px-3 py-2 text-[0.875rem] text-critical">
          {moveError}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="grid gap-3 md:grid-cols-3" aria-label={t('projects.board')}>
            {COLUMNS.map((col) => (
              <Column
                key={col}
                status={col}
                projectId={id}
                tasks={all.filter((x) => x.status === col)}
                loading={tasks.isPending}
                onOpen={(taskId) => setTaskSheet({ open: true, id: taskId })}
              />
            ))}
          </div>
        </DndContext>
        {p ? (
          <Surface className="h-fit p-4">
            <Milestones kind="projects" parentId={p.id} items={p.milestones} />
            {p.description ? <p className="mt-5 whitespace-pre-wrap text-[0.875rem] text-secondary">{p.description}</p> : null}
          </Surface>
        ) : null}
      </div>

      <ProjectSheet open={editing} project={p ?? null} onOpenChange={setEditing} />
      <TaskSheet
        open={taskSheet.open}
        taskId={taskSheet.id}
        defaults={{ projectId: id }}
        onOpenChange={(open) => setTaskSheet((s) => ({ ...s, open }))}
      />
    </div>
  );
}

function Column({
  status,
  projectId,
  tasks,
  loading,
  onOpen,
}: {
  status: TaskStatusValue;
  projectId: string;
  tasks: TaskDto[];
  loading: boolean;
  onOpen: (id: string) => void;
}) {
  const { t } = useI18n();
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const create = useCreateTask();
  const [title, setTitle] = useState('');

  return (
    <section
      ref={setNodeRef}
      aria-label={t(`status.${status}`)}
      className={cn('flex min-h-[220px] flex-col rounded-lg bg-sunken/70 p-2.5 transition-colors', isOver && 'bg-accent-soft')}
    >
      <h2 className="flex items-center justify-between px-1.5 pb-2 pt-0.5 text-[0.875rem] font-semibold">
        {t(`status.${status}`)}
        <span className="tabular-nums text-tertiary">{tasks.length}</span>
      </h2>
      <ul className="flex flex-col gap-2">
        {loading ? <Skeleton className="h-16" /> : null}
        {tasks.map((task) => (
          <Card key={task.id} task={task} onOpen={onOpen} />
        ))}
      </ul>
      {status === 'TODO' ? (
        <form
          className="mt-2 flex gap-1.5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!title.trim()) return;
            await create.mutateAsync({ title, projectId });
            setTitle('');
          }}
        >
          <Input className="h-9 bg-raised text-[0.875rem]" placeholder={t('projects.addTask')} aria-label={t('projects.addTask')} value={title} onChange={(e) => setTitle(e.target.value)} />
          <Button type="submit" size="icon-sm" variant="ghost" className="h-9 w-9" aria-label={t('projects.addTask')} loading={create.isPending}>
            {create.isPending ? null : <Plus className="h-4 w-4" />}
          </Button>
        </form>
      ) : null}
    </section>
  );
}

function Card({ task, onOpen }: { task: TaskDto; onOpen: (id: string) => void }) {
  const { t, locale } = useI18n();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  return (
    <li
      ref={setNodeRef}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={cn('touch-none rounded-md bg-raised shadow-sm', isDragging && 'relative z-10 shadow-lg')}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-roledescription={t('projects.draggable')}
        onClick={() => onOpen(task.id)}
        className="flex w-full cursor-grab flex-col gap-1.5 rounded-md p-3 text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40 active:cursor-grabbing"
      >
        <span className={cn('text-[0.875rem] leading-snug', task.status === 'COMPLETED' && 'text-tertiary line-through')}>{task.title}</span>
        <span className="flex flex-wrap items-center gap-2 text-[0.75rem] text-secondary">
          <PriorityBadge priority={task.priority} />
          {task.estimatedMinutes ? <span className="tabular-nums">{formatDuration(task.estimatedMinutes, locale)}</span> : null}
          {task.actualMinutes ? <Badge>{formatDuration(task.actualMinutes, locale)} ✓</Badge> : null}
          {task.subtaskCount ? <span className="tabular-nums">{task.subtasksDone}/{task.subtaskCount}</span> : null}
        </span>
      </button>
    </li>
  );
}
