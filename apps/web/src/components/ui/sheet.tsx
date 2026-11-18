'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Button, cn } from '@lifeos/ui';
import { X } from 'lucide-react';
import { type ReactNode } from 'react';
import { useI18n } from '@/i18n/i18n';

/**
 * Editing surface: a side panel on wide screens, a bottom sheet on phones.
 * Radix handles focus trapping, Escape and returning focus to the trigger.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay data-[state=open]:animate-[fade-in_var(--duration-fast)_ease-out]" />
        <Dialog.Content
          className={cn(
            'fixed z-50 flex flex-col bg-raised shadow-lg outline-none',
            'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-xl',
            'sm:inset-y-0 sm:left-auto sm:right-0 sm:h-dvh sm:max-h-none sm:w-[min(480px,100vw)] sm:rounded-none sm:rounded-l-xl',
          )}
          aria-describedby={description ? undefined : undefined}
        >
          <div className="flex items-start justify-between gap-3 border-b border-separator px-5 pb-3 pt-4">
            <div className="min-w-0">
              <Dialog.Title className="text-[1.0625rem] font-semibold">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 text-[0.8125rem] text-secondary">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t('common.close')}>
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? (
            <div className="flex items-center justify-end gap-2 border-t border-separator px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
              {footer}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Destructive confirmation with an explicit Cancel (never defaults to the destructive action). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  pending?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-overlay" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[70] w-[min(400px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-raised p-6 shadow-lg outline-none">
          <Dialog.Title className="text-[1.0625rem] font-semibold">{title}</Dialog.Title>
          <Dialog.Description className="mt-1.5 text-[0.875rem] text-secondary">{description}</Dialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="secondary">{t('common.cancel')}</Button>
            </Dialog.Close>
            <Button variant="destructive" loading={pending} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Page title row used by every module page. */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-[2rem] font-bold leading-tight tracking-[-0.025em]">{title}</h1>
        {subtitle ? <p className="mt-1 text-[0.9375rem] text-secondary">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
