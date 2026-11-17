'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Field, Input } from '@lifeos/ui';
import { type LoginInput, loginSchema } from '@lifeos/validation';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useForm } from 'react-hook-form';
import { AuthHeading, FormError } from '@/components/auth/auth-shell';
import { useI18n } from '@/i18n/i18n';
import { ApiError } from '@/lib/api';
import { useLogin } from '@/lib/queries';

/** Only allow same-site relative redirects after sign-in (no open redirect). */
function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/today';
}

function LoginForm() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const login = useLogin();
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), mode: 'onTouched' });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await login.mutateAsync(values);
      router.replace(safeNext(params.get('next')));
    } catch {
      /* surfaced below */
    }
  });

  const error = login.error instanceof ApiError ? login.error.message : login.error ? 'Network error — check your connection.' : undefined;

  return (
    <>
      <AuthHeading title={t('auth.signInTitle')} subtitle={t('auth.signInSubtitle')} />
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormError message={error} />
        <Field label={t('auth.email')} error={form.formState.errors.email?.message}>
          {(p) => <Input {...p} type="email" autoComplete="email" autoFocus {...form.register('email')} />}
        </Field>
        <Field label={t('auth.password')} error={form.formState.errors.password?.message}>
          {(p) => <Input {...p} type="password" autoComplete="current-password" {...form.register('password')} />}
        </Field>
        <div className="-mt-1 flex justify-end">
          <Link href="/forgot-password" className="text-[0.8125rem] text-accent hover:underline">
            {t('auth.forgot')}
          </Link>
        </div>
        <Button type="submit" size="lg" loading={login.isPending}>
          {t('auth.signIn')}
        </Button>
      </form>
      <p className="mt-6 text-center text-[0.875rem] text-secondary">
        {t('auth.noAccount')}{' '}
        <Link href="/register" className="font-medium text-accent hover:underline">
          {t('auth.createAccount')}
        </Link>
      </p>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
