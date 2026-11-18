'use client';

import { type CategoryRef, type PriorityValue } from '@lifeos/shared';
import { Badge, Select } from '@lifeos/ui';
import { type ReactNode } from 'react';
import { useI18n } from '@/i18n/i18n';
import { ApiError } from '@/lib/api';
import { useCategories } from '@/lib/module-queries';

export const PRIORITIES: PriorityValue[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export const PRIORITY_TONE: Record<PriorityValue, 'critical' | 'warning' | 'neutral'> = {
  URGENT: 'critical',
  HIGH: 'warning',
  MEDIUM: 'neutral',
  LOW: 'neutral',
};

export function PriorityBadge({ priority, showMedium = false }: { priority: PriorityValue; showMedium?: boolean }) {
  const { t } = useI18n();
  if (!showMedium && (priority === 'MEDIUM' || priority === 'LOW')) return null;
  return <Badge tone={PRIORITY_TONE[priority]}>{t(`priority.${priority}`)}</Badge>;
}

export function CategoryDot({ category }: { category: CategoryRef | null }) {
  if (!category) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-[0.8125rem] text-secondary">
      <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: category.color }} />
      {category.name}
    </span>
  );
}

export function PrioritySelect({ value, onChange, id, ...aria }: { value: PriorityValue; onChange: (v: PriorityValue) => void; id?: string }) {
  const { t } = useI18n();
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value as PriorityValue)} {...aria}>
      {PRIORITIES.map((p) => (
        <option key={p} value={p}>
          {t(`priority.${p}`)}
        </option>
      ))}
    </Select>
  );
}

export function CategorySelect({ value, onChange, id }: { value: string | null; onChange: (v: string | null) => void; id?: string }) {
  const { t } = useI18n();
  const categories = useCategories();
  return (
    <Select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{t('common.none')}</option>
      {categories.data?.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </Select>
  );
}

/** Two controls side by side on wide screens, stacked on phones. */
export function Row({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

/** First field-level message for `field`, or the general message for 4xx errors. */
export function errorFor(error: unknown, field?: string): string | undefined {
  if (!(error instanceof ApiError)) return undefined;
  if (field) return error.fieldError(field);
  return error.message;
}

/** Local datetime-input value ("YYYY-MM-DDTHH:mm") ↔ ISO instant, in the browser's zone. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const RECURRENCE_PRESETS = [
  { value: '', key: 'recurrence.none' },
  { value: 'FREQ=DAILY', key: 'recurrence.daily' },
  { value: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', key: 'recurrence.weekdays' },
  { value: 'FREQ=WEEKLY', key: 'recurrence.weekly' },
  { value: 'FREQ=WEEKLY;INTERVAL=2', key: 'recurrence.biweekly' },
  { value: 'FREQ=MONTHLY', key: 'recurrence.monthly' },
] as const;

/** Preset picker; an existing custom rule is kept and shown as "Custom". */
export function RecurrenceSelect({ value, onChange, id }: { value: string | null; onChange: (v: string | null) => void; id?: string }) {
  const { t } = useI18n();
  const known = RECURRENCE_PRESETS.some((p) => p.value === (value ?? ''));
  return (
    <Select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      {RECURRENCE_PRESETS.map((p) => (
        <option key={p.key} value={p.value}>
          {t(p.key)}
        </option>
      ))}
      {!known && value ? <option value={value}>{t('recurrence.custom', { rule: value })}</option> : null}
    </Select>
  );
}
