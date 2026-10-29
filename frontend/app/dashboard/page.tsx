'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { api, type Workspace } from '@/lib/api';

export default function DashboardPage() {
  const { user, token, loading, logout } = useAuth();
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    if (!token) return;
    api.workspaces
      .list(token)
      .then(setWorkspaces)
      .catch((e) => setError(e.message));
  }, [token]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const ws = await api.workspaces.create(token, newName.trim());
      setWorkspaces((prev) => [ws, ...prev]);
      setNewName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create');
    } finally {
      setCreating(false);
    }
  }

  if (loading || !user) {
    return <main className="min-h-screen p-8">Loading…</main>;
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Workspaces</h1>
          <button
            onClick={() => {
              logout();
              router.replace('/');
            }}
            className="px-3 py-1.5 rounded border text-sm"
          >
            Log out
          </button>
        </div>

        <p className="text-sm text-gray-600">Signed in as {user.email}</p>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
            {error}
          </p>
        )}

        <form onSubmit={onCreate} className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New workspace name"
            className="flex-1 border rounded px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={creating || !newName.trim()}
            className="px-4 py-2 rounded bg-black text-white text-sm disabled:opacity-50"
          >
            {creating ? 'Creating…' : 'Create'}
          </button>
        </form>

        <ul className="space-y-2">
          {workspaces.map((ws) => (
            <li key={ws.id}>
              <Link
                href={`/workspaces/${ws.id}`}
                className="block border rounded-lg p-4 hover:bg-gray-50"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{ws.name}</span>
                  <span className="text-xs text-gray-500">
                    {ws._count?.documents ?? 0} docs ·{' '}
                    {ws._count?.members ?? 1} members
                  </span>
                </div>
              </Link>
            </li>
          ))}
          {workspaces.length === 0 && (
            <li className="text-sm text-gray-500">
              No workspaces yet — create one above.
            </li>
          )}
        </ul>
      </div>
    </main>
  );
}