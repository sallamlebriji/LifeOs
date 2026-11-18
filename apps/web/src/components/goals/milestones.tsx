'use client';

import { type MilestoneDto } from '@lifeos/shared';
import { Button, CheckCircle, Input } from '@lifeos/ui';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '@/i18n/i18n';
import { useMilestones } from '@/lib/module-queries';

/** Milestone checklist shared by goals and projects. */
export function Milestones({ kind, parentId, items }: { kind: 'goals' | 'projects'; parentId: string; items: MilestoneDto[] }) {
  const { t, locale } = useI18n();
  const m = useMilestones(kind);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const fmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });

  return (
    <section aria-labelledby={`ms-${parentId}`}>
      <h3 id={`ms-${parentId}`} className="mb-2 text-[0.9375rem] font-semibold">
        {t('milestones.title')}
      </h3>
      {items.length === 0 ? <p className="mb-2 text-[0.8125rem] text-tertiary">{t('milestones.empty')}</p> : null}
      <ul className="flex flex-col">
        {items.map((ms) => (
          <li key={ms.id} className="group flex min-h-11 items-center gap-3">
            <CheckCircle
              checked={!!ms.completedAt}
              label={t(ms.completedAt ? 'today.markUndone' : 'today.markDone', { title: ms.title })}
              onClick={() => m.update.mutate({ parentId, id: ms.id, completed: !ms.completedAt })}
            />
            <span className={`flex-1 ${ms.completedAt ? 'text-tertiary line-through' : ''}`}>{ms.title}</span>
            {ms.dueDate ? <span className="text-[0.8125rem] tabular-nums text-secondary">{fmt.format(new Date(`${ms.dueDate}T12:00:00Z`))}</span> : null}
            <Button variant="ghost" size="icon-sm" aria-label={t('milestones.remove', { title: ms.title })} onClick={() => m.remove.mutate({ parentId, id: ms.id })}>
              <X className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="mt-1 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return;
          await m.add.mutateAsync({ parentId, title, dueDate: dueDate || null });
          setTitle('');
          setDueDate('');
        }}
      >
        <Input className="h-10" aria-label={t('milestones.add')} placeholder={t('milestones.add')} value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input className="h-10 w-[9.5rem]" type="date" aria-label={t('milestones.due')} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        <Button type="submit" variant="secondary" size="icon" aria-label={t('milestones.add')} loading={m.add.isPending}>
          {m.add.isPending ? null : <Plus className="h-4 w-4" />}
        </Button>
      </form>
    </section>
  );
}
