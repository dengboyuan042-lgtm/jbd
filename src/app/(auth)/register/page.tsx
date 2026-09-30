import type { Metadata } from 'next';
import Link from 'next/link';

import { env } from '@/lib/env';
import { AuthForm } from '@/features/auth/auth-form';
import { product } from '@/lib/product';

export const metadata: Metadata = { title: 'Create account' };

export default function RegisterPage() {
  if (!env().ALLOW_SIGNUP) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg px-5 py-12">
        <div className="w-full max-w-[21rem] animate-rise space-y-3">
          <h1 className="text-xl font-medium tracking-tight text-fg">
            Sign-up is closed
          </h1>
          <p className="text-sm leading-relaxed text-tertiary">
            This {product.name} instance is private. Accounts are provisioned by
            the owner.
          </p>
          <Link
            href="/login"
            className="inline-block text-sm text-accent-text hover:underline"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }
  return <AuthForm mode="register" />;
}
