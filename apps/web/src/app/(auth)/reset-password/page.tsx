'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Field, Input } from '@lifeos/ui';
import { passwordSchema, z } from '@lifeos/validation';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useForm } from 'react-hook-form';
import { AuthHeading, FormError } from '@/components/auth/auth-shell';
import { useI18n } from '@/i18n/i18n';
import { api, ApiError } from '@/lib/api';

const schema = z.object({ password: passwordSchema });

function ResetForm() {
  const { t } = useI18n();
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const reset = useMutation({
    mutationFn: (password: string) =>
      api<void>('/auth/reset-password', { method: 'POST', body: { token, password }, noRefresh: true }),
    onSuccess: () => router.replace('/login'),
  });

  return (
    <>
      <AuthHeading title={t('auth.resetTitle')} />
      <form onSubmit={form.handleSubmit((v) => reset.mutate(v.password))} noValidate className="flex flex-col gap-4">
        <FormError
          message={!token ? t('auth.verifyFailed') : reset.error instanceof ApiError ? reset.error.message : undefined}
        />
        <Field label={t('auth.newPassword')} hint={t('auth.passwordHint')} error={form.formState.errors.password?.message}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" autoFocus {...form.register('password')} />}
        </Field>
        <Button type="submit" size="lg" loading={reset.isPending} disabled={!token}>
          {t('auth.setPassword')}
        </Button>
      </form>
      <p className="mt-6 text-center text-[0.875rem]">
        <Link href="/login" className="font-medium text-accent hover:underline">
          {t('auth.backToSignIn')}
        </Link>
      </p>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
