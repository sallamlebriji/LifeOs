'use client';

import { type CalendarEventDto, type EventMutationResponse, type PriorityValue } from '@lifeos/shared';
import { Button, Field, Input, Segmented, Textarea } from '@lifeos/ui';
import { Lock, Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { CategorySelect, errorFor, PrioritySelect, RecurrenceSelect, Row } from '@/components/ui/fields';
import { ConfirmDialog, Sheet } from '@/components/ui/sheet';
import { useI18n } from '@/i18n/i18n';
import { useCreateEvent, useDeleteEvent, useUpdateEvent } from '@/lib/module-queries';
import { fromZonedInput, toZonedInput } from './calendar-model';

interface Form {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  description: string;
  priority: PriorityValue;
  flexibility: 'FIXED' | 'FLEXIBLE';
  locked: boolean;
  recurrenceRule: string | null;
  categoryId: string | null;
}

export interface EventDraft {
  startAt: string;
  endAt: string;
}

/**
 * Create or edit an event series. When editing an occurrence of a recurring
 * series, times are shown for that occurrence and saved as the same shift on the series.
 */
export function EventSheet({
  open,
  onOpenChange,
  event,
  draft,
  timezone,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  event: CalendarEventDto | null;
  draft: EventDraft | null;
  timezone: string;
  onSaved: (result: EventMutationResponse) => void;
}) {
  const { t } = useI18n();
  const create = useCreateEvent();
  const update = useUpdateEvent();
  const remove = useDeleteEvent();
  const [confirm, setConfirm] = useState(false);
  const mutation = event ? update : create;
  const err = (f: string) => errorFor(mutation.error, f);

  const initial = (): Form => ({
    title: event?.title ?? '',
    start: toZonedInput(event?.startAt ?? draft?.startAt, timezone),
    end: toZonedInput(event?.endAt ?? draft?.endAt, timezone),
    allDay: event?.allDay ?? false,
    location: event?.location ?? '',
    description: event?.description ?? '',
    priority: event?.priority ?? 'MEDIUM',
    flexibility: event?.flexibility ?? 'FIXED',
    locked: event?.locked ?? false,
    recurrenceRule: event?.recurrenceRule ?? null,
    categoryId: event?.category?.id ?? null,
  });
  const [form, setForm] = useState<Form>(initial);

  useEffect(() => {
    if (open) {
      setForm(initial());
      create.reset();
      update.reset();
    }
  }, [open, event?.id, event?.startAt, draft?.startAt]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    let startAt = fromZonedInput(form.start, timezone);
    let endAt = fromZonedInput(form.end, timezone);
    if (!startAt || !endAt) return;
    if (event && event.isOccurrence) {
      // Shift the series by the same amount this occurrence moved.
      const delta = new Date(startAt).getTime() - new Date(event.startAt).getTime();
      const duration = new Date(endAt).getTime() - new Date(startAt).getTime();
      startAt = new Date(new Date(event.seriesStartAt).getTime() + delta).toISOString();
      endAt = new Date(new Date(startAt).getTime() + duration).toISOString();
    }
    const body = {
      title: form.title,
      startAt,
      endAt,
      allDay: form.allDay,
      location: form.location.trim() || null,
      description: form.description.trim() || null,
      priority: form.priority,
      flexibility: form.flexibility,
      locked: form.locked,
      recurrenceRule: form.recurrenceRule,
      categoryId: form.categoryId,
    };
    try {
      const result = event ? await update.mutateAsync({ id: event.id, version: event.version, ...body }) : await create.mutateAsync({ ...body, timezone });
      onSaved(result);
      onOpenChange(false);
    } catch {
      /* inline */
    }
  }

  const general = mutation.error && !err('title') && !err('endAt') && !err('startAt') && !err('recurrenceRule') ? errorFor(mutation.error) : undefined;

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        title={event ? t('calendar.editEvent') : t('calendar.newEvent')}
        description={event?.recurrenceRule ? t('calendar.seriesNote') : undefined}
        footer={
          <>
            {event ? (
              <Button variant="ghost" className="mr-auto text-critical" onClick={() => setConfirm(true)}>
                <Trash2 className="h-4 w-4" aria-hidden />
                {t('common.delete')}
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="event-form" loading={mutation.isPending}>
              {event ? t('common.save') : t('calendar.add')}
            </Button>
          </>
        }
      >
        <form id="event-form" className="flex flex-col gap-4" onSubmit={submit} noValidate>
          {general ? (
            <p role="alert" className="rounded-md bg-critical-soft px-3 py-2 text-[0.875rem] text-critical">
              {general}
            </p>
          ) : null}
          <Field label={t('tasks.title')} error={err('title')}>
            {(p) => <Input {...p} autoFocus value={form.title} onChange={(e) => set('title', e.target.value)} />}
          </Field>
          <Row>
            <Field label={t('calendar.starts')} error={err('startAt')}>
              {(p) => <Input {...p} type="datetime-local" value={form.start} onChange={(e) => set('start', e.target.value)} />}
            </Field>
            <Field label={t('calendar.ends')} error={err('endAt')}>
              {(p) => <Input {...p} type="datetime-local" value={form.end} onChange={(e) => set('end', e.target.value)} />}
            </Field>
          </Row>
          <p className="-mt-2 text-[0.8125rem] text-tertiary">{t('calendar.timesIn', { tz: timezone })}</p>
          <label className="flex items-center gap-2.5 text-[0.9375rem]">
            <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={form.allDay} onChange={(e) => set('allDay', e.target.checked)} />
            {t('calendar.allDay')}
          </label>
          <Row>
            <Field label={t('tasks.repeat')} error={err('recurrenceRule')}>
              {(p) => <RecurrenceSelect id={p.id} value={form.recurrenceRule} onChange={(v) => set('recurrenceRule', v)} />}
            </Field>
            <Field label={t('tasks.category')}>{(p) => <CategorySelect id={p.id} value={form.categoryId} onChange={(v) => set('categoryId', v)} />}</Field>
          </Row>
          <Field label={t('calendar.location')}>{(p) => <Input {...p} value={form.location} onChange={(e) => set('location', e.target.value)} />}</Field>

          <fieldset className="flex flex-col gap-3 rounded-lg bg-sunken/60 p-3.5">
            <legend className="sr-only">{t('calendar.planning')}</legend>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[0.8125rem] font-medium text-secondary">{t('calendar.flexibility')}</span>
              <Segmented
                size="sm"
                label={t('calendar.flexibility')}
                value={form.flexibility}
                onChange={(v) => set('flexibility', v)}
                options={[
                  { value: 'FIXED', label: t('tasks.fixed') },
                  { value: 'FLEXIBLE', label: t('tasks.flexible') },
                ]}
              />
            </div>
            <label className="flex items-start gap-2.5 text-[0.9375rem]">
              <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--accent)]" checked={form.locked} onChange={(e) => set('locked', e.target.checked)} />
              <span>
                <span className="inline-flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5" aria-hidden />
                  {t('calendar.locked')}
                </span>
                <span className="block text-[0.8125rem] text-tertiary">{t('calendar.lockedHint')}</span>
              </span>
            </label>
            <Field label={t('tasks.priority')}>{(p) => <PrioritySelect id={p.id} value={form.priority} onChange={(v) => set('priority', v)} />}</Field>
          </fieldset>
          <Field label={t('tasks.notes')}>{(p) => <Textarea {...p} value={form.description} onChange={(e) => set('description', e.target.value)} />}</Field>
        </form>
      </Sheet>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t('calendar.deleteTitle')}
        description={event?.recurrenceRule ? t('calendar.deleteSeriesBody') : t('calendar.deleteBody')}
        confirmLabel={t('common.delete')}
        pending={remove.isPending}
        onConfirm={async () => {
          if (!event) return;
          await remove.mutateAsync(event.id);
          setConfirm(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}
