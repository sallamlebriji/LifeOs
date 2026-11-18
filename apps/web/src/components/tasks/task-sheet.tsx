'use client';

import { type PriorityValue, type TaskDetailDto, type TaskDto } from '@lifeos/shared';
import { Badge, Button, CheckCircle, Field, Input, Segmented, Select, Textarea } from '@lifeos/ui';
import { Link2, Plus, Timer, Trash2, X } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import {
  CategorySelect,
  errorFor,
  fromLocalInput,
  PrioritySelect,
  RecurrenceSelect,
  Row,
  toLocalInput,
} from '@/components/ui/fields';
import { ConfirmDialog, Sheet } from '@/components/ui/sheet';
import { useI18n } from '@/i18n/i18n';
import { formatDuration } from '@/lib/format';
import {
  useAddDependency,
  useCreateTask,
  useDeleteTask,
  useGoals,
  useLogTime,
  useProjects,
  useRemoveDependency,
  useTask,
  useTasks,
  useTaskStatus,
  useUpdateTask,
} from '@/lib/module-queries';

interface FormState {
  title: string;
  notes: string;
  priority: PriorityValue;
  categoryId: string | null;
  projectId: string | null;
  goalId: string | null;
  estimatedMinutes: string;
  plannedDate: string;
  dueAt: string;
  schedulingMode: 'FLEXIBLE' | 'FIXED';
  fixedStartAt: string;
  splittable: boolean;
  minSessionMinutes: string;
  preferredTimeOfDay: TaskDto['preferredTimeOfDay'];
  recurrenceRule: string | null;
}

function initialState(task?: TaskDto | null, defaults?: Partial<FormState>): FormState {
  return {
    title: task?.title ?? '',
    notes: task?.notes ?? '',
    priority: task?.priority ?? 'MEDIUM',
    categoryId: task?.category?.id ?? null,
    projectId: task?.projectId ?? null,
    goalId: task?.goalId ?? null,
    estimatedMinutes: task?.estimatedMinutes ? String(task.estimatedMinutes) : '',
    plannedDate: task?.plannedDate ?? '',
    dueAt: toLocalInput(task?.dueAt),
    schedulingMode: task?.schedulingMode ?? 'FLEXIBLE',
    fixedStartAt: toLocalInput(task?.fixedStartAt),
    splittable: task?.splittable ?? false,
    minSessionMinutes: task?.minSessionMinutes ? String(task.minSessionMinutes) : '',
    preferredTimeOfDay: task?.preferredTimeOfDay ?? 'ANY',
    recurrenceRule: task?.recurrenceRule ?? null,
    ...defaults,
  };
}

const num = (v: string) => (v.trim() ? Number(v) : null);

/** Create (taskId null) or edit a task, with subtasks, dependencies and time tracking. */
export function TaskSheet({
  open,
  onOpenChange,
  taskId,
  defaults,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string | null;
  defaults?: Partial<FormState>;
}) {
  const { t, locale } = useI18n();
  const detail = useTask(open ? taskId : null);
  const task = detail.data;
  const [form, setForm] = useState<FormState>(() => initialState(null, defaults));
  const create = useCreateTask();
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const projects = useProjects();
  const goals = useGoals();

  useEffect(() => {
    if (!open) return;
    setForm(initialState(taskId ? task : null, taskId ? undefined : defaults));
    create.reset();
    update.reset();
  }, [open, taskId, task?.version]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const mutation = taskId ? update : create;
  const err = (field: string) => errorFor(mutation.error, field);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = {
      title: form.title,
      notes: form.notes.trim() ? form.notes : null,
      priority: form.priority,
      categoryId: form.categoryId,
      projectId: form.projectId,
      goalId: form.goalId,
      estimatedMinutes: num(form.estimatedMinutes),
      plannedDate: form.plannedDate || null,
      dueAt: fromLocalInput(form.dueAt),
      schedulingMode: form.schedulingMode,
      fixedStartAt: form.schedulingMode === 'FIXED' ? fromLocalInput(form.fixedStartAt) : null,
      splittable: form.schedulingMode === 'FIXED' ? false : form.splittable,
      minSessionMinutes: form.splittable ? num(form.minSessionMinutes) : null,
      preferredTimeOfDay: form.preferredTimeOfDay,
      recurrenceRule: form.recurrenceRule,
    };
    try {
      if (taskId && task) await update.mutateAsync({ id: taskId, version: task.version, ...body });
      else await create.mutateAsync(body);
      onOpenChange(false);
    } catch {
      /* errors render inline */
    }
  }

  const general = mutation.error && !Object.keys((mutation.error as { issues?: object }).issues ?? {}).length ? errorFor(mutation.error) : undefined;

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        title={taskId ? t('tasks.edit') : t('tasks.new')}
        footer={
          <>
            {taskId ? (
              <Button variant="ghost" className="mr-auto text-critical" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4" aria-hidden />
                {t('common.delete')}
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="task-form" loading={mutation.isPending}>
              {taskId ? t('common.save') : t('tasks.create')}
            </Button>
          </>
        }
      >
        <form id="task-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
          {general ? (
            <p role="alert" className="rounded-md bg-critical-soft px-3 py-2 text-[0.875rem] text-critical">
              {general}
            </p>
          ) : null}
          <Field label={t('tasks.title')} error={err('title')}>
            {(p) => <Input {...p} autoFocus value={form.title} onChange={(e) => set('title', e.target.value)} />}
          </Field>
          <Row>
            <Field label={t('tasks.priority')}>{(p) => <PrioritySelect id={p.id} value={form.priority} onChange={(v) => set('priority', v)} />}</Field>
            <Field label={t('tasks.category')}>{(p) => <CategorySelect id={p.id} value={form.categoryId} onChange={(v) => set('categoryId', v)} />}</Field>
          </Row>
          <Row>
            <Field label={t('tasks.project')} error={err('projectId')}>
              {(p) => (
                <Select {...p} value={form.projectId ?? ''} onChange={(e) => set('projectId', e.target.value || null)}>
                  <option value="">{t('common.none')}</option>
                  {projects.data?.items.map((pr) => (
                    <option key={pr.id} value={pr.id}>
                      {pr.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('tasks.goal')} error={err('goalId')}>
              {(p) => (
                <Select {...p} value={form.goalId ?? ''} onChange={(e) => set('goalId', e.target.value || null)}>
                  <option value="">{t('common.none')}</option>
                  {goals.data?.items
                    .filter((g) => g.status === 'ACTIVE' || g.status === 'NOT_STARTED' || g.id === form.goalId)
                    .map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.title}
                      </option>
                    ))}
                </Select>
              )}
            </Field>
          </Row>
          <Row>
            <Field label={t('tasks.plannedDate')} error={err('plannedDate')}>
              {(p) => <Input {...p} type="date" value={form.plannedDate} onChange={(e) => set('plannedDate', e.target.value)} />}
            </Field>
            <Field label={t('tasks.dueAt')} error={err('dueAt')}>
              {(p) => <Input {...p} type="datetime-local" value={form.dueAt} onChange={(e) => set('dueAt', e.target.value)} />}
            </Field>
          </Row>
          <Row>
            <Field label={t('tasks.estimate')} hint={t('tasks.estimateHint')} error={err('estimatedMinutes')}>
              {(p) => (
                <Input {...p} type="number" inputMode="numeric" min={5} max={1440} step={5} value={form.estimatedMinutes} onChange={(e) => set('estimatedMinutes', e.target.value)} />
              )}
            </Field>
            <Field label={t('tasks.repeat')} error={err('recurrenceRule')}>
              {(p) => <RecurrenceSelect id={p.id} value={form.recurrenceRule} onChange={(v) => set('recurrenceRule', v)} />}
            </Field>
          </Row>

          <fieldset className="flex flex-col gap-3 rounded-lg bg-sunken/60 p-3.5">
            <legend className="sr-only">{t('tasks.scheduling')}</legend>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[0.8125rem] font-medium text-secondary">{t('tasks.scheduling')}</span>
              <Segmented
                size="sm"
                label={t('tasks.scheduling')}
                value={form.schedulingMode}
                onChange={(v) => set('schedulingMode', v)}
                options={[
                  { value: 'FLEXIBLE', label: t('tasks.flexible') },
                  { value: 'FIXED', label: t('tasks.fixed') },
                ]}
              />
            </div>
            {form.schedulingMode === 'FIXED' ? (
              <Field label={t('tasks.fixedStart')} error={err('fixedStartAt')}>
                {(p) => <Input {...p} type="datetime-local" value={form.fixedStartAt} onChange={(e) => set('fixedStartAt', e.target.value)} />}
              </Field>
            ) : (
              <>
                <Field label={t('tasks.preferredTime')}>
                  {(p) => (
                    <Select {...p} value={form.preferredTimeOfDay} onChange={(e) => set('preferredTimeOfDay', e.target.value as FormState['preferredTimeOfDay'])}>
                      {(['ANY', 'MORNING', 'AFTERNOON', 'EVENING', 'NIGHT'] as const).map((v) => (
                        <option key={v} value={v}>
                          {t(`timeOfDay.${v}`)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <label className="flex items-center gap-2.5 text-[0.9375rem]">
                  <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={form.splittable} onChange={(e) => set('splittable', e.target.checked)} />
                  {t('tasks.splittable')}
                </label>
                {form.splittable ? (
                  <Field label={t('tasks.minSession')} error={err('minSessionMinutes')}>
                    {(p) => <Input {...p} type="number" min={5} max={480} step={5} value={form.minSessionMinutes} onChange={(e) => set('minSessionMinutes', e.target.value)} />}
                  </Field>
                ) : null}
              </>
            )}
            <p className="text-[0.8125rem] text-tertiary">{t('tasks.schedulingHint')}</p>
          </fieldset>

          <Field label={t('tasks.notes')} error={err('notes')}>
            {(p) => <Textarea {...p} value={form.notes} onChange={(e) => set('notes', e.target.value)} />}
          </Field>
        </form>

        {taskId && task ? (
          <div className="mt-6 flex flex-col gap-6">
            <Subtasks task={task} />
            <Dependencies task={task} />
            <TimeTracking task={task} locale={locale} />
          </div>
        ) : null}
      </Sheet>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('tasks.deleteTitle')}
        description={t('tasks.deleteBody')}
        confirmLabel={t('common.delete')}
        pending={remove.isPending}
        onConfirm={async () => {
          if (!taskId) return;
          await remove.mutateAsync(taskId);
          setConfirmDelete(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}

function Subtasks({ task }: { task: TaskDetailDto }) {
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const create = useCreateTask();
  const status = useTaskStatus();
  if (task.parentId) return null;
  return (
    <section aria-labelledby="subtasks-h">
      <h3 id="subtasks-h" className="mb-2 text-[0.9375rem] font-semibold">
        {t('tasks.subtasks')}
      </h3>
      <ul className="flex flex-col">
        {task.subtasks.map((s) => (
          <li key={s.id} className="flex min-h-11 items-center gap-3">
            <CheckCircle
              checked={s.status === 'COMPLETED'}
              label={t(s.status === 'COMPLETED' ? 'today.markUndone' : 'today.markDone', { title: s.title })}
              onClick={() => status.mutate({ id: s.id, status: s.status === 'COMPLETED' ? 'TODO' : 'COMPLETED' })}
            />
            <span className={s.status === 'COMPLETED' ? 'text-tertiary line-through' : ''}>{s.title}</span>
          </li>
        ))}
      </ul>
      <form
        className="mt-1 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return;
          await create.mutateAsync({ title, parentId: task.id, plannedDate: task.plannedDate ?? undefined });
          setTitle('');
        }}
      >
        <Input aria-label={t('tasks.addSubtask')} placeholder={t('tasks.addSubtask')} value={title} onChange={(e) => setTitle(e.target.value)} className="h-10" />
        <Button type="submit" variant="secondary" size="icon" aria-label={t('tasks.addSubtask')} loading={create.isPending}>
          {create.isPending ? null : <Plus className="h-4 w-4" />}
        </Button>
      </form>
    </section>
  );
}

function Dependencies({ task }: { task: TaskDetailDto }) {
  const { t } = useI18n();
  const candidates = useTasks({ status: 'OPEN', limit: 100 });
  const add = useAddDependency();
  const remove = useRemoveDependency();
  const options = useMemo(
    () =>
      (candidates.data?.pages.flatMap((p) => p.items) ?? []).filter(
        (c) => c.id !== task.id && !task.dependsOn.some((d) => d.id === c.id),
      ),
    [candidates.data, task],
  );
  return (
    <section aria-labelledby="deps-h">
      <h3 id="deps-h" className="mb-1 text-[0.9375rem] font-semibold">
        {t('tasks.dependsOn')}
      </h3>
      <p className="mb-2 text-[0.8125rem] text-tertiary">{t('tasks.dependsOnHint')}</p>
      <ul className="flex flex-col gap-1">
        {task.dependsOn.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-2 rounded-md bg-sunken/60 px-3 py-2 text-[0.875rem]">
            <span className="inline-flex items-center gap-2">
              <Link2 className="h-4 w-4 text-tertiary" aria-hidden />
              {d.title}
              {d.status === 'COMPLETED' ? <Badge tone="positive">{t('tasks.done')}</Badge> : null}
            </span>
            <Button variant="ghost" size="icon-sm" aria-label={t('tasks.removeDependency', { title: d.title })} onClick={() => remove.mutate({ id: task.id, dependsOnId: d.id })}>
              <X className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
      <Select
        aria-label={t('tasks.addDependency')}
        className="mt-2 h-10"
        value=""
        onChange={(e) => e.target.value && add.mutate({ id: task.id, dependsOnId: e.target.value })}
      >
        <option value="">{t('tasks.addDependency')}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.title}
          </option>
        ))}
      </Select>
      {add.error ? (
        <p role="alert" className="mt-1.5 text-[0.8125rem] text-critical">
          {errorFor(add.error, 'dependsOnId') ?? errorFor(add.error)}
        </p>
      ) : null}
      {task.blocks.length ? (
        <p className="mt-2 text-[0.8125rem] text-secondary">{t('tasks.blocks', { list: task.blocks.map((b) => b.title).join(', ') })}</p>
      ) : null}
    </section>
  );
}

function TimeTracking({ task, locale }: { task: TaskDetailDto; locale: string }) {
  const { t } = useI18n();
  const log = useLogTime();
  return (
    <section aria-labelledby="time-h">
      <h3 id="time-h" className="mb-2 text-[0.9375rem] font-semibold">
        {t('tasks.timeTracked')}
      </h3>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[0.9375rem] tabular-nums">
          <Timer className="h-4 w-4 text-tertiary" aria-hidden />
          {formatDuration(task.actualMinutes ?? 0, locale)}
          {task.estimatedMinutes ? <span className="text-secondary"> / {formatDuration(task.estimatedMinutes, locale)}</span> : null}
        </span>
        <span className="mx-1 h-4 w-px bg-separator" aria-hidden />
        {[15, 30, 60].map((m) => (
          <Button key={m} size="sm" variant="secondary" loading={log.isPending && log.variables?.minutes === m} onClick={() => log.mutate({ id: task.id, minutes: m })}>
            +{formatDuration(m, locale)}
          </Button>
        ))}
      </div>
    </section>
  );
}
