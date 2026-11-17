'use client';

import { Button, ErrorState, Skeleton } from '@lifeos/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DayRibbon } from '@/components/today/day-ribbon';
import {
  AgendaSection,
  FocusTiles,
  FreeSlotsSection,
  GoalsSection,
  HabitsSection,
  InsightsSection,
  TasksSection,
} from '@/components/today/sections';
import { useI18n } from '@/i18n/i18n';
import { formatLongDate, hourIn, shiftDateKey } from '@/lib/format';
import { useMe, useMyDay } from '@/lib/queries';

/** Re-renders every minute so "now" and greetings stay current. */
function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function LoadingDay() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      <Skeleton className="h-[148px] rounded-xl" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-[120px] rounded-lg" />
        <Skeleton className="h-[120px] rounded-lg" />
      </div>
      <Skeleton className="h-[280px] rounded-lg" />
    </div>
  );
}

export default function TodayPage() {
  const { t, locale } = useI18n();
  const now = useNow();
  const [date, setDate] = useState<string | undefined>(undefined);
  const me = useMe();
  const day = useMyDay(date);
  const minSession = me.data?.preferences?.minSessionMinutes ?? 25;

  const tz = day.data?.timezone ?? me.data?.preferences?.timezone ?? 'Africa/Casablanca';
  const hour = hourIn(tz, now);
  const greetingKey = hour < 12 ? 'greeting.morning' : hour < 18 ? 'greeting.afternoon' : 'greeting.evening';
  const name = (me.data?.user.displayName ?? '').split(' ')[0] ?? '';

  useEffect(() => {
    document.title = `${t('nav.today')} · LifeOS`;
  }, [t]);

  return (
    <div className="mx-auto w-full max-w-[1120px] pt-4 sm:pt-6">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[0.875rem] font-medium text-secondary first-letter:uppercase">
            {day.data ? formatLongDate(day.data.date, locale) : ' '}
          </p>
          <h1 className="mt-0.5 font-display text-[2rem] font-bold leading-tight tracking-[-0.025em] sm:text-[2.125rem]">
            {day.data && !day.data.isToday ? formatLongDate(day.data.date, locale) : t(greetingKey, { name })}
          </h1>
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Day">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('today.previousDay')}
            disabled={!day.data}
            onClick={() => day.data && setDate(shiftDateKey(day.data.date, -1))}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Button variant="secondary" size="sm" disabled={!date} onClick={() => setDate(undefined)}>
            {t('today.backToToday')}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('today.nextDay')}
            disabled={!day.data}
            onClick={() => day.data && setDate(shiftDateKey(day.data.date, 1))}
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {day.isPending ? (
        <LoadingDay />
      ) : day.isError ? (
        <ErrorState title={t('today.loadError')} description={day.error.message} onRetry={() => day.refetch()} />
      ) : (
        <div className="flex flex-col gap-8">
          <DayRibbon day={day.data} now={now} />
          <FocusTiles day={day.data} now={now} />
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-8">
              <TasksSection day={day.data} date={date} />
              <AgendaSection day={day.data} now={now} />
            </div>
            <div className="flex min-w-0 flex-col gap-8">
              <InsightsSection insights={day.data.insights} />
              <HabitsSection habits={day.data.habits} dateKey={day.data.date} queryDate={date} />
              <GoalsSection goals={day.data.goals} />
              <FreeSlotsSection slots={day.data.freeSlots} timezone={day.data.timezone} minSession={minSession} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
