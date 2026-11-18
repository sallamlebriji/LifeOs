'use client';

import { Button, EmptyState, ErrorState, Input, Segmented, Select, Skeleton, Surface } from '@lifeos/ui';
import { CheckSquare, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { TaskRow } from '@/components/tasks/task-row';
import { TaskSheet } from '@/components/tasks/task-sheet';
import { PRIORITIES } from '@/components/ui/fields';
import { PageHeader } from '@/components/ui/sheet';
import { useI18n } from '@/i18n/i18n';
import { type TaskFilters, useProjects, useTasks } from '@/lib/module-queries';

type View = 'OPEN' | 'COMPLETED' | 'ALL';

function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export default function TasksPage() {
  const { t } = useI18n();
  const [view, setView] = useState<View>('OPEN');
  const [priority, setPriority] = useState('');
  const [projectId, setProjectId] = useState('');
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const [sheet, setSheet] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const projects = useProjects();

  const filters = useMemo<TaskFilters>(
    () => ({
      ...(view === 'ALL' ? {} : { status: view }),
      ...(priority ? { priority } : {}),
      ...(projectId ? { projectId } : {}),
      ...(q ? { q } : {}),
      sort: view === 'COMPLETED' ? 'created' : 'smart',
    }),
    [view, priority, projectId, q],
  );
  const tasks = useTasks(filters);
  const items = tasks.data?.pages.flatMap((p) => p.items) ?? [];

  useEffect(() => {
    document.title = `${t('nav.tasks')} · LifeOS`;
  }, [t]);

  return (
    <div className="mx-auto w-full max-w-[880px] pt-4 sm:pt-6">
      <PageHeader
        title={t('nav.tasks')}
        actions={
          <Button onClick={() => setSheet({ open: true, id: null })}>
            <Plus className="h-4 w-4" aria-hidden />
            {t('tasks.new')}
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Segmented
          label={t('tasks.show')}
          value={view}
          onChange={setView}
          options={[
            { value: 'OPEN', label: t('tasks.open') },
            { value: 'COMPLETED', label: t('tasks.completed') },
            { value: 'ALL', label: t('tasks.all') },
          ]}
        />
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tertiary" aria-hidden />
          <Input type="search" aria-label={t('tasks.search')} placeholder={t('tasks.search')} className="h-10 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Select aria-label={t('tasks.priority')} className="h-10 w-auto min-w-[8rem]" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">{t('tasks.anyPriority')}</option>
            {PRIORITIES.slice().reverse().map((p) => (
              <option key={p} value={p}>
                {t(`priority.${p}`)}
              </option>
            ))}
          </Select>
          <Select aria-label={t('tasks.project')} className="h-10 w-auto min-w-[8rem]" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">{t('tasks.anyProject')}</option>
            {projects.data?.items.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <Surface>
        {tasks.isPending ? (
          <div className="flex flex-col gap-3 p-4" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : tasks.isError ? (
          <ErrorState title={t('common.loadError')} onRetry={() => tasks.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<CheckSquare className="h-8 w-8" strokeWidth={1.5} aria-hidden />}
            title={q || priority || projectId ? t('tasks.noMatch') : view === 'COMPLETED' ? t('tasks.noneCompleted') : t('tasks.empty')}
            description={view === 'OPEN' && !q ? t('tasks.emptyDetail') : undefined}
            action={
              view === 'OPEN' && !q ? (
                <Button variant="secondary" onClick={() => setSheet({ open: true, id: null })}>
                  {t('tasks.new')}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-separator">
            {items.map((task) => (
              <TaskRow key={task.id} task={task} onOpen={(id) => setSheet({ open: true, id })} />
            ))}
          </ul>
        )}
        {tasks.hasNextPage ? (
          <div className="border-t border-separator p-3 text-center">
            <Button variant="ghost" size="sm" loading={tasks.isFetchingNextPage} onClick={() => tasks.fetchNextPage()}>
              {t('common.loadMore')}
            </Button>
          </div>
        ) : null}
      </Surface>

      <TaskSheet open={sheet.open} taskId={sheet.id} onOpenChange={(open) => setSheet((s) => ({ ...s, open }))} />
    </div>
  );
}
