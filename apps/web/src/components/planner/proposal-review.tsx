'use client';

import { type PlanningChangeDto, type ProposalDto } from '@lifeos/shared';
import { Badge, Button, cn, Input, Surface } from '@lifeos/ui';
import { AlertTriangle, CalendarPlus, Check, CheckSquare, Clock, Move, RotateCcw, Undo2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { fromZonedInput, toZonedInput, zonedParts } from '@/components/calendar/calendar-model';
import { ConfirmDialog } from '@/components/ui/sheet';
import { useI18n } from '@/i18n/i18n';
import { ApiError } from '@/lib/api';
import { formatDuration } from '@/lib/format';
import { useCalendarRange, useDecideChange, useProposalAction } from '@/lib/module-queries';

const DAY_START = 6 * 60;
const DAY_END = 23 * 60;

function clock(iso: string, tz: string) {
  const m = zonedParts(iso, tz).minutes;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** One line per day: existing time in grey, proposed time in the accent colour. */
function DayStrip({ existing, proposed, tz }: { existing: Array<{ startAt: string; endAt: string }>; proposed: PlanningChangeDto[]; tz: string }) {
  const span = DAY_END - DAY_START;
  const seg = (s: string, e: string) => {
    const a = Math.max(DAY_START, zonedParts(s, tz).minutes);
    const b = Math.min(DAY_END, zonedParts(e, tz).minutes || 1440);
    return { left: `${((a - DAY_START) / span) * 100}%`, width: `${(Math.max(0, b - a) / span) * 100}%` };
  };
  return (
    <div className="relative h-3 w-full overflow-hidden rounded-full bg-sunken" aria-hidden>
      {existing.map((x, i) => (
        <span key={`e${i}`} className="absolute inset-y-0 bg-[color:var(--content-tertiary)] opacity-60" style={seg(x.startAt, x.endAt)} />
      ))}
      {proposed.map((c) => (
        <span key={c.id} className={cn('absolute inset-y-0', c.decision === 'REJECTED' ? 'bg-transparent' : 'bg-accent')} style={seg(c.startAt!, c.endAt!)} />
      ))}
    </div>
  );
}

export function ProposalReview({ proposal, timezone, onRegenerated }: { proposal: ProposalDto; timezone: string; onRegenerated: (p: ProposalDto) => void }) {
  const { t, locale } = useI18n();
  const range = useCalendarRange(proposal.periodStart, proposal.periodEnd);
  const decide = useDecideChange();
  const apply = useProposalAction('apply');
  const reject = useProposalAction('reject');
  const regenerate = useProposalAction('regenerate');
  const revert = useProposalAction('revert');
  const [moving, setMoving] = useState<{ id: string; start: string; end: string } | null>(null);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const pending = proposal.status === 'PENDING';

  const placed = proposal.changes.filter((c) => c.type !== 'UNSCHEDULED' && c.startAt && c.endAt);
  const unscheduled = proposal.changes.filter((c) => c.type === 'UNSCHEDULED');
  const kept = placed.filter((c) => c.decision !== 'REJECTED');

  const days = useMemo(() => {
    const keys = new Set<string>();
    for (let d = new Date(proposal.periodStart); d < new Date(proposal.periodEnd); d = new Date(d.getTime() + 86_400_000)) {
      keys.add(zonedParts(new Date(d.getTime() + 12 * 3_600_000), timezone).dateKey);
    }
    return [...keys].sort();
  }, [proposal.periodStart, proposal.periodEnd, timezone]);

  const existingFor = (day: string) => [
    ...(range.data?.events ?? []).filter((e) => !e.allDay && zonedParts(e.startAt, timezone).dateKey === day),
    ...(pending ? (range.data?.taskBlocks ?? []) : []).filter((b) => zonedParts(b.startAt, timezone).dateKey === day),
  ];
  const changesFor = (day: string) => placed.filter((c) => zonedParts(c.startAt!, timezone).dateKey === day);
  const dayFmt = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const actionError = [apply, reject, regenerate, revert, decide].map((m) => m.error).find(Boolean);
  const stale = apply.error instanceof ApiError && apply.error.status === 409 && /changed/.test(apply.error.message);

  const statusTone = { PENDING: 'accent', APPLIED: 'positive', REVERTED: 'neutral', REJECTED: 'neutral', EXPIRED: 'warning', SUPERSEDED: 'neutral', FAILED: 'critical' } as const;
  const totalMinutes = kept.reduce((s, c) => s + (new Date(c.endAt!).getTime() - new Date(c.startAt!).getTime()) / 60_000, 0);

  return (
    <Surface className="flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-separator p-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-[1.0625rem] font-semibold">{t('planner.proposal')}</h2>
            <Badge tone={statusTone[proposal.status]}>{t(`proposalStatus.${proposal.status}`)}</Badge>
            {proposal.revision > 1 ? <span className="text-[0.8125rem] text-tertiary">{t('planner.revision', { n: proposal.revision })}</span> : null}
          </div>
          {proposal.summary ? <p className="mt-1 text-[0.9375rem] text-secondary">{proposal.summary}</p> : null}
          <p className="mt-1 text-[0.8125rem] text-tertiary">
            {t('planner.totals', { count: kept.length, time: formatDuration(totalMinutes, locale) })}
            {pending ? ` · ${t('planner.expires', { time: new Intl.DateTimeFormat(locale, { weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(proposal.expiresAt)) })}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {pending ? (
            <>
              <Button variant="ghost" loading={reject.isPending} onClick={() => reject.mutate(proposal.id)}>
                {t('planner.discard')}
              </Button>
              <Button variant="secondary" loading={regenerate.isPending} onClick={async () => onRegenerated(await regenerate.mutateAsync(proposal.id))}>
                <RotateCcw className="h-4 w-4" aria-hidden />
                {t('planner.regenerate')}
              </Button>
              <Button loading={apply.isPending} disabled={!kept.length} onClick={() => apply.mutate(proposal.id)}>
                <Check className="h-4 w-4" aria-hidden />
                {t('planner.apply', { count: kept.length })}
              </Button>
            </>
          ) : proposal.status === 'APPLIED' ? (
            <Button variant="secondary" onClick={() => setConfirmUndo(true)}>
              <Undo2 className="h-4 w-4" aria-hidden />
              {t('planner.undo')}
            </Button>
          ) : proposal.status === 'EXPIRED' || proposal.status === 'REJECTED' ? (
            <Button variant="secondary" loading={regenerate.isPending} onClick={async () => onRegenerated(await regenerate.mutateAsync(proposal.id))}>
              <RotateCcw className="h-4 w-4" aria-hidden />
              {t('planner.regenerate')}
            </Button>
          ) : null}
        </div>
      </div>

      {actionError ? (
        <div role="alert" className="mx-5 mt-4 flex flex-wrap items-center gap-2 rounded-md bg-critical-soft px-3 py-2 text-[0.875rem] text-critical">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          <span className="flex-1">{actionError instanceof ApiError ? actionError.message : t('common.loadError')}</span>
          {stale ? (
            <Button size="sm" variant="secondary" onClick={async () => onRegenerated(await regenerate.mutateAsync(proposal.id))}>
              {t('planner.regenerate')}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-1 p-5 pt-4">
        <p className="mb-2 flex items-center gap-4 text-[0.75rem] text-tertiary">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-full bg-[color:var(--content-tertiary)] opacity-60" aria-hidden />
            {t('planner.legendExisting')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-full bg-accent" aria-hidden />
            {t('planner.legendProposed')}
          </span>
        </p>
        {days.map((day) => {
          const changes = changesFor(day);
          const existing = existingFor(day);
          return (
            <section key={day} className="border-t border-separator py-3 first:border-t-0" aria-label={dayFmt.format(new Date(`${day}T12:00:00Z`))}>
              <div className="mb-2 flex items-center gap-3">
                <h3 className="w-40 shrink-0 text-[0.875rem] font-semibold first-letter:uppercase">{dayFmt.format(new Date(`${day}T12:00:00Z`))}</h3>
                <DayStrip existing={existing} proposed={changes} tz={timezone} />
                <span className="w-16 shrink-0 text-right text-[0.75rem] tabular-nums text-tertiary">
                  {proposal.explanation?.dailyWorkload[day] ? formatDuration(proposal.explanation.dailyWorkload[day]!, locale) : ''}
                </span>
              </div>
              {changes.length === 0 ? <p className="pl-1 text-[0.8125rem] text-tertiary">{t('planner.nothingThisDay')}</p> : null}
              <ul className="flex flex-col">
                {changes.map((c) => {
                  const rejected = c.decision === 'REJECTED';
                  const isMoving = moving?.id === c.id;
                  return (
                    <li key={c.id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-1 py-1.5', rejected && 'opacity-50')}>
                      <span className="w-[6.5rem] shrink-0 text-[0.8125rem] tabular-nums text-secondary">
                        {clock(c.startAt!, timezone)}–{clock(c.endAt!, timezone)}
                      </span>
                      {c.type === 'SCHEDULE_TASK' ? <CheckSquare className="h-4 w-4 text-tertiary" aria-label={t('planner.taskBlock')} /> : <CalendarPlus className="h-4 w-4 text-tertiary" aria-label={t('planner.newEvent')} />}
                      <span className={cn('min-w-0 flex-1 text-[0.9375rem]', rejected && 'line-through')}>
                        {c.title}
                        {c.decision === 'MODIFIED' ? <Badge className="ml-2">{t('planner.moved')}</Badge> : null}
                        {c.reason ? <span className="block text-[0.75rem] text-tertiary">{c.reason}</span> : null}
                      </span>
                      {pending ? (
                        <span className="flex items-center gap-1">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={t('planner.move', { title: c.title })}
                            onClick={() => setMoving(isMoving ? null : { id: c.id, start: toZonedInput(c.startAt, timezone), end: toZonedInput(c.endAt, timezone) })}
                          >
                            <Move className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-pressed={rejected}
                            aria-label={rejected ? t('planner.keep', { title: c.title }) : t('planner.reject', { title: c.title })}
                            onClick={() => decide.mutate({ proposalId: proposal.id, changeId: c.id, decision: rejected ? 'ACCEPTED' : 'REJECTED' })}
                          >
                            {rejected ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                          </Button>
                        </span>
                      ) : null}
                      {isMoving ? (
                        <form
                          className="flex w-full flex-wrap items-center gap-2 pl-[7.25rem]"
                          onSubmit={async (e) => {
                            e.preventDefault();
                            const startAt = fromZonedInput(moving.start, timezone);
                            const endAt = fromZonedInput(moving.end, timezone);
                            if (!startAt || !endAt) return;
                            await decide.mutateAsync({ proposalId: proposal.id, changeId: c.id, decision: 'MODIFIED', startAt, endAt }).catch(() => undefined);
                            setMoving(null);
                          }}
                        >
                          <Input className="h-9 w-auto" type="datetime-local" aria-label={t('calendar.starts')} value={moving.start} onChange={(e) => setMoving({ ...moving, start: e.target.value })} />
                          <Input className="h-9 w-auto" type="datetime-local" aria-label={t('calendar.ends')} value={moving.end} onChange={(e) => setMoving({ ...moving, end: e.target.value })} />
                          <Button type="submit" size="sm" loading={decide.isPending}>
                            {t('common.save')}
                          </Button>
                        </form>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      {unscheduled.length ? (
        <div className="border-t border-separator p-5">
          <h3 className="mb-2 flex items-center gap-2 text-[0.9375rem] font-semibold">
            <Clock className="h-4 w-4 text-warning" aria-hidden />
            {t('planner.unscheduled')}
          </h3>
          <ul className="flex flex-col gap-2">
            {unscheduled.map((c) => {
              const code = (c.reason ?? '').split(': ')[0] as 'NO_FREE_SLOT' | 'NO_TIME_BEFORE_DEADLINE' | 'DAILY_FOCUS_LIMIT' | 'FIXED_TIME_TAKEN' | 'DEADLINE_PASSED';
              return (
                <li key={c.id} className="rounded-md bg-warning-soft/60 px-3 py-2 text-[0.875rem]">
                  <span className="font-medium">{c.title}</span>
                  <span className="block text-secondary">{t(`unscheduled.${code}`)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {proposal.explanation?.lines.length ? (
        <details className="border-t border-separator px-5 py-3 text-[0.8125rem] text-secondary">
          <summary className="cursor-pointer select-none font-medium text-primary">{t('planner.why')}</summary>
          <ul className="mt-2 list-disc pl-5">
            {proposal.explanation.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </details>
      ) : null}

      <ConfirmDialog
        open={confirmUndo}
        onOpenChange={setConfirmUndo}
        title={t('planner.undoTitle')}
        description={t('planner.undoBody')}
        confirmLabel={t('planner.undo')}
        pending={revert.isPending}
        onConfirm={async () => {
          await revert.mutateAsync(proposal.id).catch(() => undefined);
          setConfirmUndo(false);
        }}
      />
    </Surface>
  );
}
