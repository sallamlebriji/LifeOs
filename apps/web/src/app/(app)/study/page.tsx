'use client';

import { type StudyChapter, type StudySubjectDto } from '@lifeos/shared';
import { Badge, Button, CheckCircle, cn, EmptyState, Field, Input, ProgressBar, Select, Skeleton, Surface } from '@lifeos/ui';
import { BookOpen, Brain, Plus, Trash2, X } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { errorFor, fromLocalInput, PrioritySelect, Row, toLocalInput } from '@/components/ui/fields';
import { ConfirmDialog, PageHeader, Sheet } from '@/components/ui/sheet';
import { useI18n } from '@/i18n/i18n';
import { formatDuration } from '@/lib/format';
import { useCreateStudySession, useCreateSubject, useDeleteSubject, useDueReviews, useStudySessions, useSubjects, useUpdateSubject } from '@/lib/module-queries';

const QUALITY = [0, 1, 2, 3, 4, 5];

export default function StudyPage() {
  const { t, locale } = useI18n();
  const subjects = useSubjects();
  const due = useDueReviews();
  const sessions = useStudySessions();
  const log = useCreateStudySession();
  const [subjectSheet, setSubjectSheet] = useState<{ open: boolean; subject: StudySubjectDto | null }>({ open: false, subject: null });
  const [sessionSheet, setSessionSheet] = useState<{ open: boolean; subjectId?: string; topic?: string; kind?: 'LEARNING' | 'REVISION' }>({ open: false });

  useEffect(() => {
    document.title = `${t('nav.study')} · LifeOS`;
  }, [t]);

  return (
    <div className="mx-auto w-full max-w-[960px] pt-4 sm:pt-6">
      <PageHeader
        title={t('nav.study')}
        actions={
          <>
            <Button variant="secondary" onClick={() => setSessionSheet({ open: true })} disabled={!subjects.data?.length}>
              {t('study.logSession')}
            </Button>
            <Button onClick={() => setSubjectSheet({ open: true, subject: null })}>
              <Plus className="h-4 w-4" aria-hidden />
              {t('study.newSubject')}
            </Button>
          </>
        }
      />

      {due.data?.length ? (
        <Surface className="mb-6 p-5">
          <h2 className="mb-1 flex items-center gap-2 text-[1.0625rem] font-semibold">
            <Brain className="h-5 w-5 text-accent" aria-hidden />
            {t('study.dueTitle', { count: due.data.length })}
          </h2>
          <p className="mb-3 text-[0.8125rem] text-secondary">{t('study.dueHint')}</p>
          <ul className="flex flex-col divide-y divide-separator">
            {due.data.map((d) => (
              <li key={`${d.subjectId}-${d.topic}`} className="flex flex-wrap items-center gap-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{d.topic}</span>
                  <span className="ml-2 text-[0.8125rem] text-secondary">{d.subjectName}</span>
                </span>
                <span className="text-[0.75rem] text-tertiary">{t('study.recall')}</span>
                <span className="flex gap-1" role="group" aria-label={t('study.rateRecall', { topic: d.topic })}>
                  {QUALITY.map((q) => (
                    <Button
                      key={q}
                      size="icon-sm"
                      variant="secondary"
                      aria-label={`${q} — ${t(`quality.${q}` as 'quality.0')}`}
                      title={t(`quality.${q}` as 'quality.0')}
                      loading={log.isPending && log.variables?.quality === q && log.variables?.topic === d.topic}
                      onClick={() => {
                        const end = new Date();
                        log.mutate({ subjectId: d.subjectId, kind: 'REVISION', topic: d.topic, startAt: new Date(end.getTime() - 15 * 60_000).toISOString(), endAt: end.toISOString(), completed: true, quality: q });
                      }}
                    >
                      {q}
                    </Button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </Surface>
      ) : null}

      {subjects.isPending ? (
        <Skeleton className="h-40" />
      ) : !subjects.data?.length ? (
        <Surface>
          <EmptyState icon={<BookOpen className="h-8 w-8" strokeWidth={1.5} aria-hidden />} title={t('study.empty')} description={t('study.emptyDetail')} />
        </Surface>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {subjects.data.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setSubjectSheet({ open: true, subject: s })}
                className="flex h-full w-full flex-col gap-2.5 rounded-lg bg-raised p-4 text-left shadow-sm hover:shadow-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40"
              >
                <span className="flex items-center gap-2">
                  <span aria-hidden className="h-3 w-3 rounded-[4px]" style={{ background: s.color ?? 'var(--accent)' }} />
                  <span className="flex-1 font-medium">{s.name}</span>
                  {s.dueReviews ? <Badge tone="accent">{t('study.dueBadge', { count: s.dueReviews })}</Badge> : null}
                </span>
                <ProgressBar value={s.progress} label={t('study.chaptersDone')} />
                <span className="flex flex-wrap gap-x-3 text-[0.8125rem] text-secondary">
                  <span>{t('study.chapters', { done: s.chapters.filter((c) => c.done).length, total: s.chapters.length })}</span>
                  <span className="tabular-nums">
                    {formatDuration(s.minutesThisWeek, locale)}
                    {s.weeklyTargetMinutes ? ` / ${formatDuration(s.weeklyTargetMinutes, locale)}` : ''} {t('study.thisWeek')}
                  </span>
                  {s.examDate ? <span className="text-warning">{t('study.exam', { date: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(s.examDate)) })}</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {sessions.data?.length ? (
        <section className="mt-8">
          <h2 className="mb-2 px-1 text-[1.0625rem] font-semibold">{t('study.recent')}</h2>
          <Surface>
            <ul className="divide-y divide-separator">
              {sessions.data.slice(0, 10).map((x) => (
                <li key={x.id} className="flex items-center gap-3 px-4 py-2.5 text-[0.875rem]">
                  <span className="w-24 shrink-0 text-secondary">{new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(x.startAt))}</span>
                  <span className="min-w-0 flex-1">
                    {x.subjectName}
                    {x.topic ? <span className="text-secondary"> · {x.topic}</span> : null}
                  </span>
                  <Badge tone={x.kind === 'REVISION' ? 'accent' : x.kind === 'EXAM' ? 'warning' : 'neutral'}>{t(`studyKind.${x.kind}`)}</Badge>
                  {x.nextReviewAt ? <span className="text-[0.75rem] text-tertiary">{t('study.nextReview', { date: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(x.nextReviewAt)) })}</span> : null}
                </li>
              ))}
            </ul>
          </Surface>
        </section>
      ) : null}

      <SubjectSheet open={subjectSheet.open} subject={subjectSheet.subject} onOpenChange={(open) => setSubjectSheet((x) => ({ ...x, open }))} />
      <SessionSheet {...sessionSheet} subjects={subjects.data ?? []} onOpenChange={(open) => setSessionSheet((x) => ({ ...x, open }))} />
    </div>
  );
}

function SubjectSheet({ open, subject, onOpenChange }: { open: boolean; subject: StudySubjectDto | null; onOpenChange: (o: boolean) => void }) {
  const { t } = useI18n();
  const create = useCreateSubject();
  const update = useUpdateSubject();
  const remove = useDeleteSubject();
  const [confirm, setConfirm] = useState(false);
  const [name, setName] = useState('');
  const [importance, setImportance] = useState<StudySubjectDto['importance']>('MEDIUM');
  const [exam, setExam] = useState('');
  const [target, setTarget] = useState('');
  const [chapters, setChapters] = useState<StudyChapter[]>([]);
  const [newChapter, setNewChapter] = useState('');
  const mutation = subject ? update : create;

  useEffect(() => {
    if (!open) return;
    setName(subject?.name ?? '');
    setImportance(subject?.importance ?? 'MEDIUM');
    setExam(toLocalInput(subject?.examDate));
    setTarget(subject?.weeklyTargetMinutes ? String(subject.weeklyTargetMinutes) : '');
    setChapters(subject?.chapters ?? []);
    create.reset();
    update.reset();
  }, [open, subject?.id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = { name, importance, examDate: fromLocalInput(exam), weeklyTargetMinutes: target ? Number(target) : null, chapters };
    try {
      if (subject) await update.mutateAsync({ id: subject.id, ...body });
      else await create.mutateAsync(body);
      onOpenChange(false);
    } catch {
      /* inline */
    }
  }

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        title={subject ? t('study.editSubject') : t('study.newSubject')}
        footer={
          <>
            {subject ? (
              <Button variant="ghost" className="mr-auto text-critical" onClick={() => setConfirm(true)}>
                <Trash2 className="h-4 w-4" aria-hidden />
                {t('common.delete')}
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button type="submit" form="subject-form" loading={mutation.isPending}>{subject ? t('common.save') : t('study.create')}</Button>
          </>
        }
      >
        <form id="subject-form" className="flex flex-col gap-4" onSubmit={submit} noValidate>
          <Field label={t('study.subject')} error={errorFor(mutation.error, 'name')}>{(p) => <Input {...p} autoFocus value={name} onChange={(e) => setName(e.target.value)} />}</Field>
          <Row>
            <Field label={t('study.importance')}>{(p) => <PrioritySelect id={p.id} value={importance} onChange={setImportance} />}</Field>
            <Field label={t('study.weeklyTarget')} hint={t('study.weeklyTargetHint')}>{(p) => <Input {...p} type="number" min={0} step={15} value={target} onChange={(e) => setTarget(e.target.value)} />}</Field>
          </Row>
          <Field label={t('study.examDate')}>{(p) => <Input {...p} type="datetime-local" value={exam} onChange={(e) => setExam(e.target.value)} />}</Field>
          <fieldset>
            <legend className="mb-1.5 text-[0.8125rem] font-medium text-secondary">{t('study.outline')}</legend>
            <ul className="flex flex-col">
              {chapters.map((c) => (
                <li key={c.id} className="flex min-h-11 items-center gap-3">
                  <CheckCircle checked={c.done} label={t(c.done ? 'today.markUndone' : 'today.markDone', { title: c.title })} onClick={() => setChapters(chapters.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)))} />
                  <span className={cn('flex-1', c.done && 'text-tertiary line-through')}>{c.title}</span>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={t('milestones.remove', { title: c.title })} onClick={() => setChapters(chapters.filter((x) => x.id !== c.id))}><X className="h-4 w-4" /></Button>
                </li>
              ))}
            </ul>
            <div className="mt-1 flex gap-2">
              <Input
                className="h-10"
                aria-label={t('study.addChapter')}
                placeholder={t('study.addChapter')}
                value={newChapter}
                onChange={(e) => setNewChapter(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (newChapter.trim()) setChapters([...chapters, { id: crypto.randomUUID().slice(0, 12), title: newChapter.trim(), done: false }]);
                    setNewChapter('');
                  }
                }}
              />
              <Button type="button" variant="secondary" size="icon" aria-label={t('study.addChapter')} onClick={() => {
                if (newChapter.trim()) setChapters([...chapters, { id: crypto.randomUUID().slice(0, 12), title: newChapter.trim(), done: false }]);
                setNewChapter('');
              }}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </fieldset>
        </form>
      </Sheet>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t('study.deleteTitle')}
        description={t('study.deleteBody')}
        confirmLabel={t('common.delete')}
        pending={remove.isPending}
        onConfirm={async () => {
          if (!subject) return;
          await remove.mutateAsync(subject.id);
          setConfirm(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}

function SessionSheet({ open, onOpenChange, subjects, subjectId, topic: topic0, kind: kind0 }: { open: boolean; onOpenChange: (o: boolean) => void; subjects: StudySubjectDto[]; subjectId?: string; topic?: string; kind?: 'LEARNING' | 'REVISION' }) {
  const { t } = useI18n();
  const create = useCreateStudySession();
  const [subject, setSubject] = useState('');
  const [kind, setKind] = useState<'LEARNING' | 'REVISION' | 'EXAM'>('LEARNING');
  const [topic, setTopic] = useState('');
  const [start, setStart] = useState('');
  const [minutes, setMinutes] = useState('45');
  const [quality, setQuality] = useState('');

  useEffect(() => {
    if (!open) return;
    setSubject(subjectId ?? subjects[0]?.id ?? '');
    setKind(kind0 ?? 'LEARNING');
    setTopic(topic0 ?? '');
    setStart(toLocalInput(new Date(Date.now() - 45 * 60_000).toISOString()));
    setMinutes('45');
    setQuality('');
    create.reset();
  }, [open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const startAt = fromLocalInput(start);
    if (!startAt) return;
    try {
      await create.mutateAsync({
        subjectId: subject,
        kind,
        topic: topic.trim() || null,
        startAt,
        endAt: new Date(new Date(startAt).getTime() + Number(minutes) * 60_000).toISOString(),
        completed: true,
        quality: quality === '' ? null : Number(quality),
      });
      onOpenChange(false);
    } catch {
      /* inline */
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('study.logSession')}
      description={t('study.logHint')}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button type="submit" form="session-form" loading={create.isPending}>{t('study.save')}</Button>
        </>
      }
    >
      <form id="session-form" className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <Row>
          <Field label={t('study.subject')}>
            {(p) => <Select {...p} value={subject} onChange={(e) => setSubject(e.target.value)}>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}
          </Field>
          <Field label={t('sports.type')}>
            {(p) => (
              <Select {...p} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                {(['LEARNING', 'REVISION', 'EXAM'] as const).map((k) => <option key={k} value={k}>{t(`studyKind.${k}`)}</option>)}
              </Select>
            )}
          </Field>
        </Row>
        <Field label={t('study.topic')} hint={t('study.topicHint')} error={errorFor(create.error, 'topic')}>{(p) => <Input {...p} value={topic} onChange={(e) => setTopic(e.target.value)} />}</Field>
        <Row>
          <Field label={t('calendar.starts')}>{(p) => <Input {...p} type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
          <Field label={t('sports.duration')}>{(p) => <Input {...p} type="number" min={5} step={5} value={minutes} onChange={(e) => setMinutes(e.target.value)} />}</Field>
        </Row>
        {kind === 'REVISION' ? (
          <Field label={t('study.recall')} error={errorFor(create.error, 'quality')}>
            {(p) => (
              <Select {...p} value={quality} onChange={(e) => setQuality(e.target.value)}>
                <option value="">—</option>
                {QUALITY.map((q) => <option key={q} value={q}>{q} — {t(`quality.${q}` as 'quality.0')}</option>)}
              </Select>
            )}
          </Field>
        ) : null}
      </form>
    </Sheet>
  );
}
