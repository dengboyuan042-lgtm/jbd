'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { ApiError, api } from '@/lib/api';
import { product } from '@/lib/product';

export function AuthForm({
  mode,
  next,
}: {
  mode: 'login' | 'register';
  next?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = React.useState('');
  const [name, setName] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') {
        await api.post('/api/auth/login', { email, password });
      } else {
        await api.post('/api/auth/register', { email, name, password });
      }
      router.replace(next && next.startsWith('/') ? next : '/');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-5 py-12">
      <div className="w-full max-w-[21rem] animate-rise">
        <div className="mb-8 space-y-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-fg text-inverse">
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H18a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 1 4 17.5v-12Z" />
              <path d="M8 7.5h7M8 11h5" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="text-xl font-medium tracking-tight text-fg">
            {mode === 'login' ? `Sign in to ${product.name}` : `Create your ${product.name} account`}
          </h1>
          <p className="text-sm text-tertiary">{product.description}</p>
        </div>

        <form onSubmit={submit} className="space-y-3.5">
          {mode === 'register' ? (
            <Field label="Name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Chen"
                autoComplete="name"
                inputSize="lg"
                required
              />
            </Field>
          ) : null}

          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              inputSize="lg"
              required
            />
          </Field>

          <Field
            label="Password"
            hint={mode === 'register' ? 'at least 8 characters' : undefined}
          >
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              inputSize="lg"
              minLength={mode === 'register' ? 8 : undefined}
              required
            />
          </Field>

          {error ? (
            <p className="rounded-md border border-danger-border bg-danger-subtle px-2.5 py-2 text-xs text-danger">
              {error}
            </p>
          ) : null}

          <Button type="submit" variant="primary" size="lg" block loading={busy}>
            {mode === 'login' ? 'Sign in' : 'Create account'}
            {busy ? null : <ArrowRight className="size-3.5" />}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-tertiary">
          {mode === 'login' ? (
            <>
              No account yet?{' '}
              <Link href="/register" className="text-accent-text hover:underline">
                Create one
              </Link>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <Link href="/login" className="text-accent-text hover:underline">
                Sign in
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
