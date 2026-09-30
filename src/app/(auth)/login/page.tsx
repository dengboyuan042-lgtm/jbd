import type { Metadata } from 'next';

import { env } from '@/lib/env';
import { AuthForm } from '@/features/auth/auth-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <AuthForm mode="login" next={next} allowSignup={env().ALLOW_SIGNUP} />;
}
