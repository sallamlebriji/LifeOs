'use client';

import { Button, Spinner } from '@lifeos/ui';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';
import { AuthHeading } from '@/components/auth/auth-shell';
import { useI18n } from '@/i18n/i18n';
import { api } from '@/lib/api';

function Verify() {
  const { t } = useI18n();
  const token = useSearchParams().get('token') ?? '';
  const verify = useMutation({
    mutationFn: () => api<void>('/auth/verify-email', { method: 'POST', body: { token }, noRefresh: true }),
  });
  const started = useRef(false);
  useEffect(() => {
    // Tokens are single-use: guard against React strict-mode double effects.
    if (!started.current && token) {
      started.current = true;
      verify.mutate();
    }
  }, [token, verify]);

  if (!token || verify.isError) {
    return <AuthHeading title={t('auth.verifyFailed')} />;
  }
  if (verify.isSuccess) {
    return (
      <>
        <AuthHeading title={t('auth.verified')} />
        <Button asChild size="lg" className="w-full">
          <Link href="/today">{t('nav.today')}</Link>
        </Button>
      </>
    );
  }
  return (
    <div className="flex items-center gap-3 text-secondary" role="status">
      <Spinner /> {t('auth.verifying')}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <Verify />
    </Suspense>
  );
}
