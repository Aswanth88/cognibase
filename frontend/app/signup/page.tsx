// frontend/app/signup/page.tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

export default function SignupPage() {
  const { signup } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signup(email, password, name || undefined);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <form
        onSubmit={onSubmit}
        className="max-w-sm w-full border rounded-lg p-6 space-y-4"
      >
        <h1 className="text-2xl font-bold">Create an account</h1>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
            {error}
          </p>
        )}

        <label className="block text-sm space-y-1">
          <span>Name (optional)</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border rounded px-3 py-2"
          />
        </label>

        <label className="block text-sm space-y-1">
          <span>Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border rounded px-3 py-2"
          />
        </label>

        <label className="block text-sm space-y-1">
          <span>Password (min 8 chars)</span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border rounded px-3 py-2"
          />
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="w-full px-4 py-2 rounded bg-black text-white text-sm disabled:opacity-50"
        >
          {submitting ? 'Creating account…' : 'Sign up'}
        </button>

        <p className="text-sm text-gray-600 text-center">
          Already have an account?{' '}
          <Link href="/login" className="underline">
            Log in
          </Link>
        </p>
      </form>
    </main>
  );
}