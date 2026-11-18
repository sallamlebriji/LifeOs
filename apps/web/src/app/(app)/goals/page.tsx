'use client';

import { type GoalDto, type GoalLevelValue, type GoalStatusValue, type PriorityValue } from '@lifeos/shared';
import { Badge, Button, EmptyState, ErrorState, Field, Input, ProgressBar, Segmented, Select, Skeleton, Surface, Textarea } from '@lifeos/ui';
import { Plus, Target, Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Milestones } from '@/components/goals/milestones';
import { CategoryDot, CategorySelect, errorFor, PrioritySelect, Row } from '@/components/ui/fields';
import { ConfirmDialog, PageHeader, Sheet } from '@/components/ui/sheet';
import { useI18n } from '@/i18n/i18n';
import { useCreateGoal, useDeleteGoal, useGoals, useRecordProgress, useUpdateGoal } from '@/lib/module-queries';

const LEVELS: GoalLevelValue[] = ['ANNUAL', 'MONTHLY', 'WEEKLY', 'DAILY'];
const PARENT_LEVEL: Record<GoalLevelValue, GoalLevelValue[]> = {
  ANNUAL: [],
  MONTHLY: ['ANNUAL'],
  WEEKLY: ['ANNUAL', 'MONTHLY'],
  DAILY: ['ANNUAL', 'MONTHLY', 'WEEKLY'],
};

export default function GoalsPage() {
  const { t } = useI18n();
  const goals = useGoals();
  const [view, setView] = useState<'current' | 'done'>('current');
  const [sheet, setSheet] = useState<{ open: boolean; goal: GoalDto | null; level?: GoalLevelValue }>({ open: false, goal: null });

  useEffect(() => {
    document.title = `${t('nav.goals')} · LifeOS`;
  }, [t]);

  const all = goals.data?.items ?? [];
  const visible = all.filter((g) => (view === 'current' ? g.status === 'ACTIVE' || g.status === 'NOT_STARTED' : g.status === 'COMPLETED' || g.status === 'ABANDONED'));
  const byId = useMemo(() => new Map(all.map((g) => [g.id, g])), [all]);

  return (
    <div className="mx-auto w-full max-w-[880px] pt-4 sm:pt-6">
      <PageHeader
        title={t('nav.goals')}
        subtitle={t('goals.subtitle')}
        actions={
          <Button onClick={() => setSheet({ open: true, goal: null })}>
            <Plus className="h-4 w-4" aria-hidden />
            {t('goals.new')}
          </Button>
        }
      />
      <Segmented
        className="mb-5"
        label={t('tasks.show')}
        value={view}
        onChange={setView}
        options={[
          { value: 'current', label: t('goals.current') },
          { value: 'done', label: t('goals.finished') },
        ]}
      />

      {goals.isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : goals.isError ? (
        <Surface>
          <ErrorState title={t('common.loadError')} onRetry={() => goals.refetch()} />
        </Surface>
      ) : visible.length === 0 ? (
        <Surface>
          <EmptyState
            icon={<Target className="h-8 w-8" strokeWidth={1.5} aria-hidden />}
            title={view === 'current' ? t('goals.empty') : t('goals.noneFinished')}
            description={view === 'current' ? t('goals.emptyDetail') : undefined}
          />
        </Surface>
      ) : (
        <div className="flex flex-col gap-7">
          {LEVELS.map((level) => {
            const items = visible.filter((g) => g.level === level);
            if (!items.length) return null;
            return (
              <section key={level} aria-labelledby={`lvl-${level}`}>
                <h2 id={`lvl-${level}`} className="mb-2 px-1 text-[1.0625rem] font-semibold">
                  {t(`goalLevel.${level}`)}
                </h2>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {items.map((g) => (
                    <li key={g.id}>
                      <button
                        type="button"
                        onClick={() => setSheet({ open: true, goal: g })}
                        className="flex h-full w-full flex-col gap-2.5 rounded-lg bg-raised p-4 text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40"
                      >
                        <span className="flex items-start justify-between gap-2">
                          <span className="font-medium leading-snug">{g.title}</span>
                          {g.status === 'COMPLETED' ? <Badge tone="positive">{t('goalStatus.COMPLETED')}</Badge> : null}
                          {g.status === 'ABANDONED' ? <Badge>{t('goalStatus.ABANDONED')}</Badge> : null}
                        </span>
                        {g.parentId && byId.get(g.parentId) ? (
                          <span className="text-[0.8125rem] text-secondary">↳ {byId.get(g.parentId)!.title}</span>
                        ) : null}
                        <ProgressBar value={g.progress} label={t('goals.progress')} />
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-secondary">
                          <span className="tabular-nums">
                            {g.targetValue
                              ? `${g.currentValue} / ${g.targetValue}${g.unit ? ` ${g.unit}` : ''}`
                              : g.milestones.length
                                ? t('goals.milestonesDone', { done: g.milestones.filter((m) => m.completedAt).length, total: g.milestones.length })
                                : `${Math.round(g.progress * 100)} %`}
                          </span>
                          {g.deadline ? <DateText label={t('goals.by')} date={g.deadline} /> : null}
                          <CategoryDot category={g.category} />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <GoalSheet
        open={sheet.open}
        goal={sheet.goal ? (byId.get(sheet.goal.id) ?? sheet.goal) : null}
        goals={all}
        onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}
      />
    </div>
  );
}

function DateText({ label, date }: { label: string; date: string }) {
  const { locale } = useI18n();
  return (
    <span>
      {label} {new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))}
    </span>
  );
}

interface GoalForm {
  title: string;
  description: string;
  level: GoalLevelValue;
  priority: PriorityValue;
  status: GoalStatusValue;
  startDate: string;
  deadline: string;
  targetValue: string;
  unit: string;
  parentId: string | null;
  categoryId: string | null;
}

function toForm(g: GoalDto | null): GoalForm {
  return {
    title: g?.title ?? '',
    description: g?.description ?? '',
    level: g?.level ?? 'MONTHLY',
    priority: g?.priority ?? 'MEDIUM',
    status: g?.status ?? 'ACTIVE',
    startDate: g?.startDate ?? '',
    deadline: g?.deadline ?? '',
    targetValue: g?.targetValue ? String(g.targetValue) : '',
    unit: g?.unit ?? '',
    parentId: g?.parentId ?? null,
    categoryId: g?.category?.id ?? null,
  };
}

function GoalSheet({ open, goal, goals, onOpenChange }: { open: boolean; goal: GoalDto | null; goals: GoalDto[]; onOpenChange: (o: boolean) => void }) {
  const { t, locale } = useI18n();
  const [form, setForm] = useState<GoalForm>(() => toForm(goal));
  const create = useCreateGoal();
  const update = useUpdateGoal();
  const remove = useDeleteGoal();
  const progress = useRecordProgress();
  const [value, setValue] = useState('');
  const [confirm, setConfirm] = useState(false);
  const mutation = goal ? update : create;
  const err = (f: string) => errorFor(mutation.error, f);

  useEffect(() => {
    if (open) {
      setForm(toForm(goal));
      setValue(goal ? String(goal.currentValue) : '');
      create.reset();
      update.reset();
    }
  }, [open, goal?.id]);

  const set = <K extends keyof GoalForm>(k: K, v: GoalForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const parents = goals.filter((g) => PARENT_LEVEL[form.level].includes(g.level) && g.id !== goal?.id);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = {
      title: form.title,
      description: form.description.trim() ? form.description : null,
      level: form.level,
      priority: form.priority,
      status: form.status,
      startDate: form.startDate || null,
      deadline: form.deadline || null,
      targetValue: form.targetValue ? Number(form.targetValue) : null,
      unit: form.unit.trim() || null,
      parentId: form.parentId,
      categoryId: form.categoryId,
    };
    try {
      if (goal) await update.mutateAsync({ id: goal.id, ...body });
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
        title={goal ? t('goals.edit') : t('goals.new')}
        footer={
          <>
            {goal ? (
              <Button variant="ghost" className="mr-auto text-critical" onClick={() => setConfirm(true)}>
                <Trash2 className="h-4 w-4" aria-hidden />
                {t('common.delete')}
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="goal-form" loading={mutation.isPending}>
              {goal ? t('common.save') : t('goals.create')}
            </Button>
          </>
        }
      >
        <form id="goal-form" className="flex flex-col gap-4" onSubmit={submit} noValidate>
          {mutation.error && !err('title') && !err('deadline') && !err('parentId') ? (
            <p role="alert" className="rounded-md bg-critical-soft px-3 py-2 text-[0.875rem] text-critical">
              {errorFor(mutation.error)}
            </p>
          ) : null}
          <Field label={t('goals.titleLabel')} error={err('title')}>
            {(p) => <Input {...p} autoFocus value={form.title} onChange={(e) => set('title', e.target.value)} />}
          </Field>
          <Row>
            <Field label={t('goals.level')}>
              {(p) => (
                <Select {...p} value={form.level} onChange={(e) => set('level', e.target.value as GoalLevelValue)}>
                  {LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {t(`goalLevel.${l}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('goals.partOf')} error={err('parentId')}>
              {(p) => (
                <Select {...p} value={form.parentId ?? ''} onChange={(e) => set('parentId', e.target.value || null)} disabled={!parents.length}>
                  <option value="">{t('common.none')}</option>
                  {parents.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </Row>
          <Row>
            <Field label={t('tasks.priority')}>{(p) => <PrioritySelect id={p.id} value={form.priority} onChange={(v) => set('priority', v)} />}</Field>
            <Field label={t('goals.status')}>
              {(p) => (
                <Select {...p} value={form.status} onChange={(e) => set('status', e.target.value as GoalStatusValue)}>
                  {(['NOT_STARTED', 'ACTIVE', 'COMPLETED', 'ABANDONED'] as const).map((s) => (
                    <option key={s} value={s}>
                      {t(`goalStatus.${s}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </Row>
          <Row>
            <Field label={t('goals.start')}>{(p) => <Input {...p} type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />}</Field>
            <Field label={t('goals.deadline')} error={err('deadline')}>
              {(p) => <Input {...p} type="date" value={form.deadline} onChange={(e) => set('deadline', e.target.value)} />}
            </Field>
          </Row>
          <Row>
            <Field label={t('goals.target')} hint={t('goals.targetHint')} error={err('targetValue')}>
              {(p) => <Input {...p} type="number" min={0} step="any" value={form.targetValue} onChange={(e) => set('targetValue', e.target.value)} />}
            </Field>
            <Field label={t('goals.unit')}>{(p) => <Input {...p} placeholder="km, pages, €…" value={form.unit} onChange={(e) => set('unit', e.target.value)} />}</Field>
          </Row>
          <Field label={t('tasks.category')}>{(p) => <CategorySelect id={p.id} value={form.categoryId} onChange={(v) => set('categoryId', v)} />}</Field>
          <Field label={t('goals.description')}>{(p) => <Textarea {...p} value={form.description} onChange={(e) => set('description', e.target.value)} />}</Field>
        </form>

        {goal ? (
          <div className="mt-6 flex flex-col gap-6">
            {goal.targetValue ? (
              <section aria-labelledby="progress-h">
                <h3 id="progress-h" className="mb-2 text-[0.9375rem] font-semibold">
                  {t('goals.progress')}
                </h3>
                <form
                  className="flex gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (value === '') return;
                    await progress.mutateAsync({ id: goal.id, value: Number(value) });
                  }}
                >
                  <Input className="h-10" type="number" min={0} step="any" aria-label={t('goals.currentValue')} value={value} onChange={(e) => setValue(e.target.value)} />
                  <Button type="submit" variant="secondary" loading={progress.isPending}>
                    {t('goals.record')}
                  </Button>
                </form>
                {goal.progressLog.length ? (
                  <ol className="mt-3 flex flex-col gap-1 text-[0.8125rem] text-secondary">
                    {goal.progressLog
                      .slice(-6)
                      .reverse()
                      .map((entry) => (
                        <li key={entry.at} className="flex justify-between tabular-nums">
                          <span>{new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(entry.at))}</span>
                          <span>
                            {entry.value}
                            {goal.unit ? ` ${goal.unit}` : ''}
                          </span>
                        </li>
                      ))}
                  </ol>
                ) : null}
              </section>
            ) : null}
            <Milestones kind="goals" parentId={goal.id} items={goal.milestones} />
          </div>
        ) : null}
      </Sheet>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t('goals.deleteTitle')}
        description={t('goals.deleteBody')}
        confirmLabel={t('common.delete')}
        pending={remove.isPending}
        onConfirm={async () => {
          if (!goal) return;
          await remove.mutateAsync(goal.id);
          setConfirm(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}
