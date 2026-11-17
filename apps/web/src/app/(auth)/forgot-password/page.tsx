'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Field, Input } from '@lifeos/ui';
import { type ForgotPasswordInput, forgotPasswordSchema } from '@lifeos/validation';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { AuthHeading, FormError } from '@/components/auth/auth-shell';
import { useI18n } from '@/i18n/i18n';
import { api, ApiError } from '@/lib/api';

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const form = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });
  const request = useMutation({
    mutationFn: (body: ForgotPasswordInput) =>
      api<{ message: string }>('/auth/forgot-password', { method: 'POST', body, noRefresh: true }),
  });

  return (
    <>
      <AuthHeading title={t('auth.resetTitle')} subtitle={t('auth.resetSubtitle')} />
      {request.isSuccess ? (
        <p role="status" className="rounded-md bg-positive-soft px-3.5 py-3 text-[0.9375rem] text-positive">
          {request.data.message}
        </p>
      ) : (
        <form
          onSubmit={form.handleSubmit((v) => request.mutate(v))}
          noValidate
          className="flex flex-col gap-4"
        >
          <FormError message={request.error instanceof ApiError ? request.error.message : undefined} />
          <Field label={t('auth.email')} error={form.formState.errors.email?.message}>
            {(p) => <Input {...p} type="email" autoComplete="email" autoFocus {...form.register('email')} />}
          </Field>
          <Button type="submit" size="lg" loading={request.isPending}>
            {t('auth.sendLink')}
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-[0.875rem]">
        <Link href="/login" className="font-medium text-accent hover:underline">
          {t('auth.backToSignIn')}
        </Link>
      </p>
    </>
  );
}
