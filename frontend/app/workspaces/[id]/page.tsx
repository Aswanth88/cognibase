'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { api, type AskResult, type DocumentRecord } from '@/lib/api';

function WorkspaceContent({ id }: { id: string }) {
  const { user, token, loading } = useAuth();
  const router = useRouter();
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [result, setResult] = useState<AskResult | null>(null);
  const [askError, setAskError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token || !id) return;
    try {
      setDocs(await api.documents.list(token, id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load documents');
    }
  }, [token, id]);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const busy = docs.some(
      (d) => d.status === 'pending' || d.status === 'processing',
    );
    if (!busy) return;
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [docs, refresh]);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    setUploading(true);
    setError(null);
    try {
      await api.documents.upload(token, id, file);
      if (fileRef.current) fileRef.current.value = '';
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function onAsk(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !question.trim()) return;
    setAsking(true);
    setAskError(null);
    setResult(null);
    try {
      setResult(await api.ask(token, id, question.trim()));
    } catch (err) {
      setAskError(err instanceof Error ? err.message : 'Ask failed');
    } finally {
      setAsking(false);
    }
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <Link href="/dashboard" className="text-sm underline">
          ← Back to workspaces
        </Link>

        <h1 className="text-2xl font-bold">Workspace documents</h1>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
            {error}
          </p>
        )}

        <div className="border rounded-lg p-4 flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            onChange={onUpload}
            disabled={uploading}
            className="text-sm"
          />
          {uploading && (
            <span className="text-sm text-gray-500">Uploading…</span>
          )}
        </div>

        <table className="w-full text-sm border rounded-lg overflow-hidden">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2">Name</th>
              <th className="text-left p-2">Status</th>
              <th className="text-left p-2">Size</th>
              <th className="text-left p-2">Uploaded</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id} className="border-t">
                <td className="p-2">{d.name}</td>
                <td className="p-2">
                  <StatusBadge status={d.status} />
                </td>
                <td className="p-2">{(d.sizeBytes / 1024).toFixed(1)} KB</td>
                <td className="p-2">
                  {new Date(d.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
            {docs.length === 0 && (
              <tr>
                <td colSpan={4} className="p-4 text-center text-gray-500">
                  No documents yet — upload one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="border rounded-lg p-4 space-y-3">
          <h2 className="text-lg font-semibold">Ask a question</h2>
          <form onSubmit={onAsk} className="space-y-2">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask anything about the documents in this workspace…"
              rows={3}
              className="w-full border rounded px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={asking || !question.trim()}
              className="px-4 py-2 rounded bg-black text-white text-sm disabled:opacity-50"
            >
              {asking ? 'Thinking…' : 'Ask'}
            </button>
          </form>

          {askError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
              {askError}
            </p>
          )}

          {result && (
            <div className="space-y-3 pt-2">
              <p className="text-sm whitespace-pre-wrap">{result.answer}</p>

              {result.sources.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Sources</h3>
                  <ul className="space-y-2">
                    {result.sources.map((s) => (
                      <li
                        key={s.chunkId}
                        className="border rounded p-3 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">
                            [{s.index}] {s.documentName} · chunk #{s.chunkIndex}
                          </span>
                          <span className="text-gray-500">
                            score {(s.score * 100).toFixed(1)}%
                          </span>
                        </div>
                        <p className="text-gray-600 whitespace-pre-wrap">
                          {s.content.length > 300
                            ? s.content.slice(0, 300) + '…'
                            : s.content}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: DocumentRecord['status'] }) {
  const styles: Record<typeof status, string> = {
    pending: 'bg-gray-100 text-gray-700',
    processing: 'bg-yellow-100 text-yellow-800',
    ready: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
  };
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-medium ${styles[status]}`}
    >
      {status}
    </span>
  );
}

function WorkspacePageInner() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <p>Missing workspace ID</p>;
  return <WorkspaceContent id={id} />;
}

export default function WorkspacePage() {
  return (
    <Suspense fallback={<main className="min-h-screen p-8">Loading…</main>}>
      <WorkspacePageInner />
    </Suspense>
  );
}