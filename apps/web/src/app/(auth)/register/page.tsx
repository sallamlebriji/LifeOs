'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Field, Input } from '@lifeos/ui';
import { type RegisterInput, registerSchema, z } from '@lifeos/validation';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { AuthHeading, FormError } from '@/components/auth/auth-shell';
import { useI18n } from '@/i18n/i18n';
import { ApiError } from '@/lib/api';
import { useRegister } from '@/lib/queries';

type FormValues = z.input<typeof registerSchema>;

export default function RegisterPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const register = useRegister();
  const form = useForm<FormValues, unknown, RegisterInput>({
    resolver: zodResolver(registerSchema),
    // Validate on submit, then live: blur errors shift the layout under a pointer that is mid-click.
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      // Detect the browser's timezone; the API validates it and falls back to Africa/Casablanca.
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await register.mutateAsync({ ...values, timezone, locale });
      router.replace('/today');
    } catch (err) {
      if (err instanceof ApiError) {
        for (const field of ['email', 'password', 'displayName'] as const) {
          const msg = err.fieldError(field);
          if (msg) form.setError(field, { message: msg });
        }
      }
    }
  });

  const err = register.error;
  const banner = err instanceof ApiError ? (err.issues ? undefined : err.message) : err ? 'Network error — check your connection.' : undefined;

  return (
    <>
      <AuthHeading title={t('auth.createTitle')} subtitle={t('auth.createSubtitle')} />
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormError message={banner} />
        <Field label={t('auth.name')} error={form.formState.errors.displayName?.message}>
          {(p) => <Input {...p} autoComplete="given-name" autoFocus {...form.register('displayName')} />}
        </Field>
        <Field label={t('auth.email')} error={form.formState.errors.email?.message}>
          {(p) => <Input {...p} type="email" autoComplete="email" {...form.register('email')} />}
        </Field>
        <Field
          label={t('auth.password')}
          hint={t('auth.passwordHint')}
          error={form.formState.errors.password?.message}
        >
          {(p) => <Input {...p} type="password" autoComplete="new-password" {...form.register('password')} />}
        </Field>
        <Button type="submit" size="lg" loading={register.isPending} className="mt-1">
          {t('auth.createAccount')}
        </Button>
      </form>
      <p className="mt-6 text-center text-[0.875rem] text-secondary">
        {t('auth.haveAccount')}{' '}
        <Link href="/login" className="font-medium text-accent hover:underline">
          {t('auth.signIn')}
        </Link>
      </p>
    </>
  );
}
