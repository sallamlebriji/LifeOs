'use client';

import { type TripChecklistItem, type TripDto } from '@lifeos/shared';
import { Badge, Button, CheckCircle, cn, EmptyState, Field, Input, ProgressBar, Segmented, Select, Skeleton, Surface, Textarea } from '@lifeos/ui';
import { MapPin, Plane, Plus, Trash2, X } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { errorFor, fromLocalInput, Row, toLocalInput } from '@/components/ui/fields';
import { ConfirmDialog, PageHeader, Sheet } from '@/components/ui/sheet';
import { useI18n } from '@/i18n/i18n';
import { useAddTripActivity, useCreateTrip, useDeleteTrip, useRemoveTripActivity, useTrips, useUpdateTrip } from '@/lib/module-queries';

const STATUSES = ['PLANNING', 'BOOKED', 'ONGOING', 'COMPLETED', 'CANCELLED'] as const;

function money(n: number, currency: string | null, locale: string) {
  return currency ? new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(n) : String(Math.round(n));
}

export default function TravelPage() {
  const { t, locale } = useI18n();
  const [past, setPast] = useState(false);
  const trips = useTrips(past);
  const [sheet, setSheet] = useState<{ open: boolean; tripId: string | null }>({ open: false, tripId: null });
  const trip = trips.data?.find((x) => x.id === sheet.tripId) ?? null;
  const dateFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' });

  useEffect(() => {
    document.title = `${t('nav.travel')} · LifeOS`;
  }, [t]);

  return (
    <div className="mx-auto w-full max-w-[960px] pt-4 sm:pt-6">
      <PageHeader
        title={t('nav.travel')}
        actions={
          <Button onClick={() => setSheet({ open: true, tripId: null })}>
            <Plus className="h-4 w-4" aria-hidden />
            {t('travel.new')}
          </Button>
        }
      />
      <Segmented
        className="mb-5"
        label={t('tasks.show')}
        value={past ? 'past' : 'upcoming'}
        onChange={(v) => setPast(v === 'past')}
        options={[
          { value: 'upcoming', label: t('travel.upcoming') },
          { value: 'past', label: t('travel.past') },
        ]}
      />
      {trips.isPending ? (
        <Skeleton className="h-40" />
      ) : !trips.data?.length ? (
        <Surface>
          <EmptyState icon={<Plane className="h-8 w-8" strokeWidth={1.5} aria-hidden />} title={past ? t('travel.nonePast') : t('travel.empty')} description={past ? undefined : t('travel.emptyDetail')} />
        </Surface>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {trips.data.map((x) => {
            const done = x.checklist.filter((c) => c.done).length;
            return (
              <li key={x.id}>
                <button
                  type="button"
                  onClick={() => setSheet({ open: true, tripId: x.id })}
                  className="flex h-full w-full flex-col gap-2 rounded-lg bg-raised p-4 text-left shadow-sm hover:shadow-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40"
                >
                  <span className="flex items-center gap-2">
                    <span className="flex-1 font-medium">{x.title}</span>
                    <Badge tone={x.status === 'BOOKED' ? 'positive' : x.status === 'CANCELLED' ? 'neutral' : 'accent'}>{t(`tripStatus.${x.status}`)}</Badge>
                  </span>
                  <span className="flex items-center gap-1 text-[0.875rem] text-secondary">
                    <MapPin className="h-3.5 w-3.5" aria-hidden />
                    {x.destination}
                  </span>
                  <span className="text-[0.8125rem] text-secondary">
                    {dateFmt.format(new Date(x.departureAt))} → {dateFmt.format(new Date(x.returnAt))}
                  </span>
                  {x.checklist.length ? <ProgressBar value={done / x.checklist.length} label={t('travel.checklist')} /> : null}
                  <span className="flex flex-wrap gap-x-3 text-[0.8125rem] text-secondary">
                    {x.checklist.length ? <span>{t('travel.packed', { done, total: x.checklist.length })}</span> : null}
                    {x.budgetAmount ? (
                      <span className={cn('tabular-nums', x.spent > x.budgetAmount && 'text-critical')}>
                        {money(x.spent, x.budgetCurrency, locale)} / {money(x.budgetAmount, x.budgetCurrency, locale)}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <TripSheet open={sheet.open} trip={trip} onOpenChange={(open) => setSheet((s) => ({ ...s, open }))} onCreated={(id) => setSheet({ open: true, tripId: id })} />
    </div>
  );
}

function TripSheet({ open, trip, onOpenChange, onCreated }: { open: boolean; trip: TripDto | null; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const { t, locale } = useI18n();
  const create = useCreateTrip();
  const update = useUpdateTrip();
  const remove = useDeleteTrip();
  const addActivity = useAddTripActivity();
  const removeActivity = useRemoveTripActivity();
  const [confirm, setConfirm] = useState(false);
  const [f, setF] = useState({ title: '', destination: '', departure: '', ret: '', status: 'PLANNING' as TripDto['status'], transportation: '', accommodation: '', budget: '', currency: 'EUR', notes: '', blocks: true });
  const [checklist, setChecklist] = useState<TripChecklistItem[]>([]);
  const [item, setItem] = useState('');
  const [act, setAct] = useState({ title: '', when: '', cost: '' });
  const mutation = trip ? update : create;
  const err = (k: string) => errorFor(mutation.error, k);

  useEffect(() => {
    if (!open) return;
    setF({
      title: trip?.title ?? '',
      destination: trip?.destination ?? '',
      departure: toLocalInput(trip?.departureAt),
      ret: toLocalInput(trip?.returnAt),
      status: trip?.status ?? 'PLANNING',
      transportation: trip?.transportation ?? '',
      accommodation: trip?.accommodation ?? '',
      budget: trip?.budgetAmount ? String(trip.budgetAmount) : '',
      currency: trip?.budgetCurrency ?? 'EUR',
      notes: trip?.notes ?? '',
      blocks: trip?.blocksCalendar ?? true,
    });
    setChecklist(trip?.checklist ?? []);
    create.reset();
    update.reset();
  }, [open, trip?.id]);

  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = {
      title: f.title,
      destination: f.destination,
      departureAt: fromLocalInput(f.departure) ?? '',
      returnAt: fromLocalInput(f.ret) ?? '',
      status: f.status,
      transportation: f.transportation.trim() || null,
      accommodation: f.accommodation.trim() || null,
      budgetAmount: f.budget ? Number(f.budget) : null,
      budgetCurrency: f.budget ? f.currency.toUpperCase() : null,
      notes: f.notes.trim() || null,
      blocksCalendar: f.blocks,
      checklist,
    };
    try {
      if (trip) {
        await update.mutateAsync({ id: trip.id, ...body });
        onOpenChange(false);
      } else {
        const created = await create.mutateAsync(body);
        onCreated(created.id);
      }
    } catch {
      /* inline */
    }
  }

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        title={trip ? trip.title : t('travel.new')}
        footer={
          <>
            {trip ? (
              <Button variant="ghost" className="mr-auto text-critical" onClick={() => setConfirm(true)}>
                <Trash2 className="h-4 w-4" aria-hidden />
                {t('common.delete')}
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button type="submit" form="trip-form" loading={mutation.isPending}>{trip ? t('common.save') : t('travel.create')}</Button>
          </>
        }
      >
        <form id="trip-form" className="flex flex-col gap-4" onSubmit={submit} noValidate>
          <Row>
            <Field label={t('travel.name')} error={err('title')}>{(p) => <Input {...p} autoFocus value={f.title} onChange={(e) => set('title', e.target.value)} />}</Field>
            <Field label={t('travel.destination')} error={err('destination')}>{(p) => <Input {...p} value={f.destination} onChange={(e) => set('destination', e.target.value)} />}</Field>
          </Row>
          <Row>
            <Field label={t('travel.departure')} error={err('departureAt')}>{(p) => <Input {...p} type="datetime-local" value={f.departure} onChange={(e) => set('departure', e.target.value)} />}</Field>
            <Field label={t('travel.return')} error={err('returnAt')}>{(p) => <Input {...p} type="datetime-local" value={f.ret} onChange={(e) => set('ret', e.target.value)} />}</Field>
          </Row>
          <Row>
            <Field label={t('goals.status')}>
              {(p) => <Select {...p} value={f.status} onChange={(e) => set('status', e.target.value)}>{STATUSES.map((s) => <option key={s} value={s}>{t(`tripStatus.${s}`)}</option>)}</Select>}
            </Field>
            <div className="grid grid-cols-[1fr_80px] gap-2">
              <Field label={t('travel.budget')} error={err('budgetAmount')}>{(p) => <Input {...p} type="number" min={0} value={f.budget} onChange={(e) => set('budget', e.target.value)} />}</Field>
              <Field label={t('travel.currency')} error={err('budgetCurrency')}>{(p) => <Input {...p} maxLength={3} value={f.currency} onChange={(e) => set('currency', e.target.value.toUpperCase())} />}</Field>
            </div>
          </Row>
          <Row>
            <Field label={t('travel.transport')}>{(p) => <Input {...p} value={f.transportation} onChange={(e) => set('transportation', e.target.value)} />}</Field>
            <Field label={t('travel.stay')}>{(p) => <Input {...p} value={f.accommodation} onChange={(e) => set('accommodation', e.target.value)} />}</Field>
          </Row>
          <label className="flex items-start gap-2.5 text-[0.9375rem]">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--accent)]" checked={f.blocks} onChange={(e) => set('blocks', e.target.checked)} />
            <span>
              {t('travel.blocks')}
              <span className="block text-[0.8125rem] text-tertiary">{t('travel.blocksHint')}</span>
            </span>
          </label>
          <fieldset>
            <legend className="mb-1.5 text-[0.8125rem] font-medium text-secondary">{t('travel.checklist')}</legend>
            <ul className="flex flex-col">
              {checklist.map((c) => (
                <li key={c.id} className="flex min-h-11 items-center gap-3">
                  <CheckCircle checked={c.done} label={t(c.done ? 'today.markUndone' : 'today.markDone', { title: c.label })} onClick={() => setChecklist(checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)))} />
                  <span className={cn('flex-1', c.done && 'text-tertiary line-through')}>{c.label}</span>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={t('milestones.remove', { title: c.label })} onClick={() => setChecklist(checklist.filter((x) => x.id !== c.id))}><X className="h-4 w-4" /></Button>
                </li>
              ))}
            </ul>
            <div className="mt-1 flex gap-2">
              <Input className="h-10" aria-label={t('travel.addItem')} placeholder={t('travel.addItem')} value={item} onChange={(e) => setItem(e.target.value)} onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (item.trim()) setChecklist([...checklist, { id: crypto.randomUUID().slice(0, 12), label: item.trim(), done: false }]);
                  setItem('');
                }
              }} />
              <Button type="button" variant="secondary" size="icon" aria-label={t('travel.addItem')} onClick={() => {
                if (item.trim()) setChecklist([...checklist, { id: crypto.randomUUID().slice(0, 12), label: item.trim(), done: false }]);
                setItem('');
              }}><Plus className="h-4 w-4" /></Button>
            </div>
          </fieldset>
          <Field label={t('tasks.notes')}>{(p) => <Textarea {...p} value={f.notes} onChange={(e) => set('notes', e.target.value)} />}</Field>
        </form>

        {trip ? (
          <section className="mt-6" aria-labelledby="itinerary-h">
            <h3 id="itinerary-h" className="mb-2 text-[0.9375rem] font-semibold">{t('travel.itinerary')}</h3>
            <ul className="flex flex-col divide-y divide-separator">
              {trip.activities.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2 text-[0.875rem]">
                  <span className="w-28 shrink-0 text-secondary">{a.startAt ? new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(a.startAt)) : '—'}</span>
                  <span className="flex-1">{a.title}</span>
                  {a.cost ? <span className="tabular-nums text-secondary">{money(a.cost, trip.budgetCurrency, locale)}</span> : null}
                  <Button variant="ghost" size="icon-sm" aria-label={t('milestones.remove', { title: a.title })} onClick={() => removeActivity.mutate({ tripId: trip.id, id: a.id })}><X className="h-4 w-4" /></Button>
                </li>
              ))}
            </ul>
            <form
              className="mt-2 grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_190px_90px_auto]"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!act.title.trim()) return;
                await addActivity.mutateAsync({ tripId: trip.id, title: act.title.trim(), startAt: fromLocalInput(act.when), cost: act.cost ? Number(act.cost) : null });
                setAct({ title: '', when: '', cost: '' });
              }}
            >
              <Input className="h-10" aria-label={t('travel.addActivity')} placeholder={t('travel.addActivity')} value={act.title} onChange={(e) => setAct({ ...act, title: e.target.value })} />
              <Input className="h-10" type="datetime-local" aria-label={t('calendar.starts')} value={act.when} onChange={(e) => setAct({ ...act, when: e.target.value })} />
              <Input className="h-10" type="number" min={0} aria-label={t('travel.cost')} placeholder={t('travel.cost')} value={act.cost} onChange={(e) => setAct({ ...act, cost: e.target.value })} />
              <Button type="submit" variant="secondary" size="icon" aria-label={t('travel.addActivity')} loading={addActivity.isPending}>{addActivity.isPending ? null : <Plus className="h-4 w-4" />}</Button>
            </form>
          </section>
        ) : null}
      </Sheet>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t('travel.deleteTitle')}
        description={t('travel.deleteBody')}
        confirmLabel={t('common.delete')}
        pending={remove.isPending}
        onConfirm={async () => {
          if (!trip) return;
          await remove.mutateAsync(trip.id);
          setConfirm(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}
