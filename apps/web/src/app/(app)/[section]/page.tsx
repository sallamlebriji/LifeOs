'use client';

import { Badge, EmptyState, Surface } from '@lifeos/ui';
import { notFound, useParams } from 'next/navigation';
import { findSection } from '@/components/shell/nav';
import { useI18n } from '@/i18n/i18n';

/**
 * Modules on the roadmap. Rather than hide them (sidebar destinations should be
 * stable) or fake them, each says plainly what it will do and when it ships.
 */
export default function UpcomingSection() {
  const { t } = useI18n();
  const { section } = useParams<{ section: string }>();
  const item = findSection(section);
  if (!item || !item.phase) notFound();
  const Icon = item.icon;

  return (
    <div className="mx-auto max-w-3xl pt-6">
      <h1 className="font-display text-[2rem] font-bold tracking-[-0.025em]">{t(item.label)}</h1>
      <Surface className="mt-6">
        <EmptyState
          icon={<Icon className="h-9 w-9" strokeWidth={1.5} aria-hidden />}
          title={item.summary ?? ''}
          action={<Badge tone="accent">{t('common.comingIn', { phase: `Phase ${item.phase}` })}</Badge>}
          className="py-16"
        />
      </Surface>
    </div>
  );
}
