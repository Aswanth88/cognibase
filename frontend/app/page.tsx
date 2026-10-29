// frontend/app/page.tsx
'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

export default function Home() {
  const { user, loading } = useAuth();

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-md w-full border rounded-lg p-6 space-y-4">
        <h1 className="text-3xl font-bold">CogniBase</h1>
        <p className="text-gray-600">
          AI-powered team knowledge base with real-time Q&A.
        </p>

        {loading && <p className="text-gray-500 text-sm">Loading…</p>}

        {!loading && !user && (
          <div className="flex gap-3 pt-2">
            <Link
              href="/login"
              className="px-4 py-2 rounded bg-black text-white text-sm"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="px-4 py-2 rounded border text-sm"
            >
              Sign up
            </Link>
          </div>
        )}

        {!loading && user && (
          <div className="space-y-2">
            <p className="text-sm text-gray-700">
              Signed in as <strong>{user.email}</strong>
            </p>
            <Link
              href="/dashboard"
              className="inline-block px-4 py-2 rounded bg-black text-white text-sm"
            >
              Go to dashboard
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}