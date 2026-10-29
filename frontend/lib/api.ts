// frontend/lib/api.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL;

export type SafeUser = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LoginResponse = {
  access_token: string;
  user: SafeUser;
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type Workspace = {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  _count?: { documents: number; members: number };
};

export type DocumentRecord = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  error?: string | null;
  createdAt: string;
};


export type AskSource = {
  index: number;
  chunkId: string;
  documentId: string;
  documentName: string;
  chunkIndex: number;
  content: string;
  score: number;
};

export type AskResult = {
  answer: string;
  sources: AskSource[];
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isForm = options.body instanceof FormData;
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      message = Array.isArray(body.message)
        ? body.message.join(', ')
        : body.message || message;
    } catch {
      // non-JSON response, keep default message
    }
    throw new ApiError(message, res.status);
  }

  return res.json();
}

export const api = {
  signup: (body: { email: string; password: string; name?: string }) =>
    request<SafeUser>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  login: (body: { email: string; password: string }) =>
    request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  me: (token: string) =>
    request<SafeUser>('/auth/me', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }),

  workspaces: {
  list: (token: string) =>
    request<Workspace[]>('/workspaces', {
      headers: { Authorization: `Bearer ${token}` },
    }),
  create: (token: string, name: string) =>
    request<Workspace>('/workspaces', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name }),
    }),
},
documents: {
  list: (token: string, workspaceId: string) =>
    request<DocumentRecord[]>(`/workspaces/${workspaceId}/documents`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  upload: (token: string, workspaceId: string, file: File) => {
  const form = new FormData();
  form.append('file', file);
  return request<DocumentRecord>(`/workspaces/${workspaceId}/documents`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }, // don't set Content-Type — browser sets it with boundary
    body: form,
  });
},
},

ask: (token: string, workspaceId: string, question: string) =>
  request<AskResult>(`/workspaces/${workspaceId}/ask`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ question }),
  }),
};

