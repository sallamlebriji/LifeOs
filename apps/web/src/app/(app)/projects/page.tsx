'use client';

import { Badge, Button, EmptyState, ErrorState, ProgressBar, Segmented, Skeleton, Surface } from '@lifeos/ui';
import { FolderKanban, Plus } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProjectSheet } from '@/components/projects/project-sheet';
import { CategoryDot } from '@/components/ui/fields';
import { PageHeader } from '@/components/ui/sheet';
import { useI18n } from '@/i18n/i18n';
import { formatDuration } from '@/lib/format';
import { useProjects } from '@/lib/module-queries';

export default function ProjectsPage() {
  const { t, locale } = useI18n();
  const [view, setView] = useState<'current' | 'ARCHIVED'>('current');
  const projects = useProjects(view === 'ARCHIVED' ? 'ARCHIVED' : undefined);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    document.title = `${t('nav.projects')} · LifeOS`;
  }, [t]);

  const items = projects.data?.items ?? [];

  return (
    <div className="mx-auto w-full max-w-[1040px] pt-4 sm:pt-6">
      <PageHeader
        title={t('nav.projects')}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            {t('projects.new')}
          </Button>
        }
      />
      <Segmented
        className="mb-5"
        label={t('tasks.show')}
        value={view}
        onChange={setView}
        options={[
          { value: 'current', label: t('projects.current') },
          { value: 'ARCHIVED', label: t('projectStatus.ARCHIVED') },
        ]}
      />
      {projects.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : projects.isError ? (
        <Surface>
          <ErrorState title={t('common.loadError')} onRetry={() => projects.refetch()} />
        </Surface>
      ) : items.length === 0 ? (
        <Surface>
          <EmptyState icon={<FolderKanban className="h-8 w-8" strokeWidth={1.5} aria-hidden />} title={t('projects.empty')} description={view === 'current' ? t('projects.emptyDetail') : undefined} />
        </Surface>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => {
            const total = p.taskCounts.TODO + p.taskCounts.IN_PROGRESS + p.taskCounts.COMPLETED;
            const done = total ? p.taskCounts.COMPLETED / total : 0;
            return (
              <li key={p.id}>
                <Link
                  href={`/projects/${p.id}`}
                  className="flex h-full flex-col gap-3 rounded-lg bg-raised p-4 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40"
                >
                  <span className="flex items-center gap-2">
                    <span aria-hidden className="h-3 w-3 shrink-0 rounded-[4px]" style={{ background: p.color ?? 'var(--content-tertiary)' }} />
                    <span className="truncate font-medium">{p.name}</span>
                    {p.status !== 'ACTIVE' ? <Badge className="ml-auto">{t(`projectStatus.${p.status}`)}</Badge> : null}
                  </span>
                  <ProgressBar value={done} label={t('projects.progress')} />
                  <span className="flex flex-wrap gap-x-3 gap-y-1 text-[0.8125rem] text-secondary">
                    <span className="tabular-nums">{t('projects.tasksDone', { done: p.taskCounts.COMPLETED, total })}</span>
                    {p.trackedMinutes ? <span className="tabular-nums">{t('projects.tracked', { time: formatDuration(p.trackedMinutes, locale) })}</span> : null}
                    {p.deadline ? (
                      <span>
                        {t('goals.by')}{' '}
                        {new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${p.deadline}T12:00:00Z`))}
                      </span>
                    ) : null}
                    <CategoryDot category={p.category} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <ProjectSheet open={creating} project={null} onOpenChange={setCreating} />
    </div>
  );
}
