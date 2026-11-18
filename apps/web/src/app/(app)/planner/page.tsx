'use client';

import { type ProposalDto } from '@lifeos/shared';
import { Badge, Button, Segmented, Skeleton, Surface, Textarea } from '@lifeos/ui';
import { Send, Sparkles } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { zonedParts } from '@/components/calendar/calendar-model';
import { PlanForm } from '@/components/planner/plan-form';
import { ProposalReview } from '@/components/planner/proposal-review';
import { PageHeader } from '@/components/ui/sheet';
import { useI18n } from '@/i18n/i18n';
import { ApiError } from '@/lib/api';
import { usePlannerChat, usePlannerStatus, usePropose, useProposal, useProposals } from '@/lib/module-queries';
import { useMe } from '@/lib/queries';

interface ChatLine {
  role: 'user' | 'assistant';
  text: string;
}

export default function PlannerPage() {
  const { t, locale } = useI18n();
  const me = useMe();
  const tz = me.data?.preferences?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = zonedParts(new Date(), tz).dateKey;
  const status = usePlannerStatus();
  const proposals = useProposals();
  const propose = usePropose();
  const chat = usePlannerChat();
  const [mode, setMode] = useState<'form' | 'chat'>('form');
  const [selected, setSelected] = useState<string | null>(null);
  const proposal = useProposal(selected);
  const [message, setMessage] = useState('');
  const [conversationId, setConversationId] = useState<string>();
  const [lines, setLines] = useState<ChatLine[]>([]);

  useEffect(() => {
    document.title = `${t('nav.planner')} · LifeOS`;
  }, [t]);
  useEffect(() => {
    if (status.data?.aiConfigured) setMode('chat');
  }, [status.data?.aiConfigured]);
  useEffect(() => {
    // Open the most recent pending proposal by default.
    if (!selected && proposals.data?.length) {
      const open = proposals.data.find((p) => p.status === 'PENDING');
      if (open) setSelected(open.id);
    }
  }, [proposals.data, selected]);

  const show = (p: ProposalDto) => setSelected(p.id);

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = message.trim();
    if (!text) return;
    setLines((l) => [...l, { role: 'user', text }]);
    setMessage('');
    try {
      const res = await chat.mutateAsync({ message: text, conversationId });
      setConversationId(res.conversationId);
      setLines((l) => [...l, { role: 'assistant', text: res.reply }]);
      if (res.proposal) show(res.proposal);
    } catch (err) {
      setLines((l) => [...l, { role: 'assistant', text: err instanceof ApiError ? err.message : t('common.loadError') }]);
    }
  }

  const history = (proposals.data ?? []).filter((p) => p.id !== selected).slice(0, 6);
  const fmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: tz });

  return (
    <div className="mx-auto w-full max-w-[960px] pt-4 sm:pt-6">
      <PageHeader title={t('nav.planner')} subtitle={t('planner.subtitle')} />

      <Surface className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-separator px-5 py-3">
          <Segmented
            label={t('planner.mode')}
            value={mode}
            onChange={setMode}
            options={[
              { value: 'chat', label: t('planner.describe') },
              { value: 'form', label: t('planner.form') },
            ]}
          />
          {status.data ? (
            <Badge tone={status.data.aiConfigured ? 'positive' : 'neutral'}>
              {status.data.aiConfigured ? t('planner.aiOn', { model: status.data.model ?? '' }) : t('planner.aiOff')}
            </Badge>
          ) : null}
        </div>
        {mode === 'form' ? (
          <PlanForm today={today} weekStartsOn={me.data?.preferences?.weekStartsOn ?? 1} pending={propose.isPending} error={propose.error} onSubmit={(req) => propose.mutate(req, { onSuccess: show })} />
        ) : !status.data?.aiConfigured ? (
          <div className="p-5 text-[0.9375rem] text-secondary">
            <p>{t('planner.aiOffBody')}</p>
            <Button variant="secondary" className="mt-3" onClick={() => setMode('form')}>
              {t('planner.useForm')}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-5">
            {lines.length ? (
              <ol className="flex flex-col gap-2" aria-live="polite">
                {lines.map((l, i) => (
                  <li
                    key={i}
                    className={
                      l.role === 'user'
                        ? 'max-w-[85%] self-end rounded-lg rounded-br-sm bg-accent px-3.5 py-2 text-[0.9375rem] text-on-accent'
                        : 'max-w-[85%] self-start rounded-lg rounded-bl-sm bg-sunken px-3.5 py-2 text-[0.9375rem]'
                    }
                  >
                    {l.text}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-[0.875rem] text-tertiary">{t('planner.chatHint')}</p>
            )}
            <form className="flex items-end gap-2" onSubmit={send}>
              <Textarea
                aria-label={t('planner.describe')}
                className="min-h-[52px]"
                rows={2}
                placeholder={t('planner.chatPlaceholder')}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <Button type="submit" size="icon" aria-label={t('planner.send')} loading={chat.isPending}>
                {chat.isPending ? null : <Send className="h-4 w-4" />}
              </Button>
            </form>
            <p className="text-[0.75rem] text-tertiary">{t('planner.privacy')}</p>
          </div>
        )}
      </Surface>

      {selected && proposal.isPending ? <Skeleton className="h-64" /> : null}
      {proposal.data ? <ProposalReview proposal={proposal.data} timezone={tz} onRegenerated={show} /> : null}
      {!selected && !proposals.isPending ? (
        <Surface className="flex items-center gap-3 p-5 text-[0.9375rem] text-secondary">
          <Sparkles className="h-5 w-5 text-tertiary" aria-hidden />
          {t('planner.empty')}
        </Surface>
      ) : null}

      {history.length ? (
        <section className="mt-8" aria-labelledby="history-h">
          <h2 id="history-h" className="mb-2 px-1 text-[1.0625rem] font-semibold">
            {t('planner.history')}
          </h2>
          <Surface>
            <ul className="divide-y divide-separator">
              {history.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => setSelected(p.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-sunken/50">
                    <span className="flex-1 text-[0.9375rem]">
                      {fmt.format(new Date(p.periodStart))} – {fmt.format(new Date(new Date(p.periodEnd).getTime() - 1))}
                      <span className="ml-2 text-[0.8125rem] text-tertiary">{t('planner.items', { count: p.changes.filter((c) => c.type !== 'UNSCHEDULED').length })}</span>
                    </span>
                    <Badge tone={p.status === 'APPLIED' ? 'positive' : p.status === 'PENDING' ? 'accent' : 'neutral'}>{t(`proposalStatus.${p.status}`)}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          </Surface>
        </section>
      ) : null}
    </div>
  );
}
