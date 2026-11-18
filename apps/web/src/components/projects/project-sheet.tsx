'use client';

import { type PriorityValue, type ProjectDto, type ProjectStatusValue } from '@lifeos/shared';
import { Button, Field, Input, Select, Textarea } from '@lifeos/ui';
import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { CategorySelect, errorFor, PrioritySelect, Row } from '@/components/ui/fields';
import { ConfirmDialog, Sheet } from '@/components/ui/sheet';
import { useI18n } from '@/i18n/i18n';
import { useCreateProject, useDeleteProject, useGoals, useUpdateProject } from '@/lib/module-queries';

export const PROJECT_STATUSES: ProjectStatusValue[] = ['PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'];
export const PROJECT_COLORS = ['#0A84FF', '#30D158', '#FF9F0A', '#BF5AF2', '#FF375F', '#64D2FF', '#8E8E93'];

interface Form {
  name: string;
  description: string;
  status: ProjectStatusValue;
  priority: PriorityValue;
  color: string | null;
  startDate: string;
  deadline: string;
  goalId: string | null;
  categoryId: string | null;
}

const toForm = (p: ProjectDto | null): Form => ({
  name: p?.name ?? '',
  description: p?.description ?? '',
  status: p?.status ?? 'ACTIVE',
  priority: p?.priority ?? 'MEDIUM',
  color: p?.color ?? PROJECT_COLORS[0]!,
  startDate: p?.startDate ?? '',
  deadline: p?.deadline ?? '',
  goalId: p?.goalId ?? null,
  categoryId: p?.category?.id ?? null,
});

export function ProjectSheet({ open, project, onOpenChange }: { open: boolean; project: ProjectDto | null; onOpenChange: (o: boolean) => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const [form, setForm] = useState<Form>(() => toForm(project));
  const create = useCreateProject();
  const update = useUpdateProject();
  const remove = useDeleteProject();
  const goals = useGoals();
  const [confirm, setConfirm] = useState(false);
  const mutation = project ? update : create;
  const err = (f: string) => errorFor(mutation.error, f);

  useEffect(() => {
    if (open) {
      setForm(toForm(project));
      create.reset();
      update.reset();
    }
  }, [open, project?.id]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = {
      name: form.name,
      description: form.description.trim() ? form.description : null,
      status: form.status,
      priority: form.priority,
      color: form.color,
      startDate: form.startDate || null,
      deadline: form.deadline || null,
      goalId: form.goalId,
      categoryId: form.categoryId,
    };
    try {
      if (project) await update.mutateAsync({ id: project.id, ...body });
      else {
        const created = await create.mutateAsync(body);
        router.push(`/projects/${created.id}`);
      }
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
        title={project ? t('projects.edit') : t('projects.new')}
        footer={
          <>
            {project ? (
              <Button variant="ghost" className="mr-auto text-critical" onClick={() => setConfirm(true)}>
                <Trash2 className="h-4 w-4" aria-hidden />
                {t('common.delete')}
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="project-form" loading={mutation.isPending}>
              {project ? t('common.save') : t('projects.create')}
            </Button>
          </>
        }
      >
        <form id="project-form" className="flex flex-col gap-4" onSubmit={submit} noValidate>
          <Field label={t('projects.name')} error={err('name')}>
            {(p) => <Input {...p} autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} />}
          </Field>
          <Row>
            <Field label={t('goals.status')}>
              {(p) => (
                <Select {...p} value={form.status} onChange={(e) => set('status', e.target.value as ProjectStatusValue)}>
                  {PROJECT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`projectStatus.${s}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('tasks.priority')}>{(p) => <PrioritySelect id={p.id} value={form.priority} onChange={(v) => set('priority', v)} />}</Field>
          </Row>
          <Row>
            <Field label={t('goals.start')}>{(p) => <Input {...p} type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />}</Field>
            <Field label={t('goals.deadline')} error={err('deadline')}>
              {(p) => <Input {...p} type="date" value={form.deadline} onChange={(e) => set('deadline', e.target.value)} />}
            </Field>
          </Row>
          <Row>
            <Field label={t('tasks.goal')}>
              {(p) => (
                <Select {...p} value={form.goalId ?? ''} onChange={(e) => set('goalId', e.target.value || null)}>
                  <option value="">{t('common.none')}</option>
                  {goals.data?.items.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('tasks.category')}>{(p) => <CategorySelect id={p.id} value={form.categoryId} onChange={(v) => set('categoryId', v)} />}</Field>
          </Row>
          <fieldset>
            <legend className="mb-1.5 text-[0.8125rem] font-medium text-secondary">{t('projects.color')}</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('projects.color')}>
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={form.color === c}
                  aria-label={c}
                  onClick={() => set('color', c)}
                  className="flex h-9 w-9 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40"
                >
                  <span
                    className="h-6 w-6 rounded-full"
                    style={{ background: c, boxShadow: form.color === c ? `0 0 0 2px var(--surface-raised), 0 0 0 4px ${c}` : undefined }}
                  />
                </button>
              ))}
            </div>
          </fieldset>
          <Field label={t('goals.description')}>{(p) => <Textarea {...p} value={form.description} onChange={(e) => set('description', e.target.value)} />}</Field>
        </form>
      </Sheet>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t('projects.deleteTitle')}
        description={t('projects.deleteBody')}
        confirmLabel={t('common.delete')}
        pending={remove.isPending}
        onConfirm={async () => {
          if (!project) return;
          await remove.mutateAsync(project.id);
          setConfirm(false);
          onOpenChange(false);
          router.push('/projects');
        }}
      />
    </>
  );
}
