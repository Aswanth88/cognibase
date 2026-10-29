# CogniBase

> AI knowledge base with RAG-powered Q&A — upload PDFs, ask questions, get grounded answers with cited sources.

CogniBase is a full-stack TypeScript application that lets teams organize documents into isolated workspaces and query them with natural-language questions. Answers are generated exclusively from the retrieved document chunks and cite their sources.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Screenshots](#screenshots)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Environment Variables](#environment-variables)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
- [How It Works](#how-it-works)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Roadmap](#roadmap)
- [What I'd Improve for Production](#what-id-improve-for-production)
- [License](#license)

---

## Features

### Authentication & Multi-Tenancy
- JWT-based signup and login with bcrypt password hashing
- Multi-tenant workspaces with role-based membership (`owner`, `admin`, `member`)
- Every query is scoped by workspace membership — users cannot read or write documents in workspaces they don't belong to

### Document Ingestion
- PDF and plain-text upload with a 20 MB per-file limit
- Asynchronous processing via **BullMQ** on **Redis** — the upload endpoint returns `202 Accepted` immediately, and a background worker handles parsing
- Automatic text extraction, chunking (`RecursiveCharacterTextSplitter`, 1000 chars / 100 overlap), and embedding
- Live ingestion status in the UI (`pending` → `processing` → `ready` / `failed`) via polling
- Exponential-backoff retries (3 attempts) on job failure

### Retrieval-Augmented Q&A
- Question embedding using **Google Gemini** (`gemini-embedding-001`, 1536 dims)
- Cosine-similarity search over `pgvector`-stored chunks with an **HNSW index** for fast approximate nearest-neighbor lookup
- Grounded generation via `gemini-2.5-flash` with a system prompt that forbids answering outside the retrieved context
- Every answer includes a list of source chunks with document name, chunk index, and similarity score

---

## Architecture

```
┌──────────────────┐        HTTPS         ┌────────────────────┐
│   Next.js 16     │ ───────────────────► │   NestJS 11 API    │
│   (App Router)   │ ◄─────────────────── │   (REST, JWT)      │
└──────────────────┘                      └─────┬──────┬───────┘
                                                │      │
                           ┌────────────────────┘      └─────────────┐
                           │                                          │
                    ┌──────▼───────┐                          ┌──────▼──────┐
                    │  Prisma ORM  │                          │  BullMQ     │
                    │  PostgreSQL  │                          │  (Redis)    │
                    │  + pgvector  │                          └──────┬──────┘
                    └──────────────┘                                 │
                                                ┌───────────────────┘
                                                │
                                    ┌───────────▼────────────┐
                                    │  Ingestion Worker      │
                                    │  pdf-parse → splitter  │
                                    │  → Gemini embeddings   │
                                    └───────────┬────────────┘
                                                │
                                        ┌───────▼────────┐
                                        │  Google Gemini │
                                        │  (embeddings + │
                                        │   chat)        │
                                        └────────────────┘
```

**Key design decisions:**

- **Async ingestion:** Embedding a 30-page PDF takes 10–30 seconds and would time out a serverless HTTP function. BullMQ decouples the request from the work, with retries and progress tracking.
- **`pgvector` over a dedicated vector DB:** At this scale, a separate vector service adds operational overhead. Keeping vectors in Postgres lets us filter by `workspaceId` in the same query as the similarity search — critical for multi-tenancy.
- **1536-dimension embeddings:** Gemini supports variable output dimensions. 1536 matches the storage cost/quality trade-off we wanted and fits within pgvector's standard HNSW limits (2000 dims).
- **Grounded prompting:** The chat prompt receives only the top-5 retrieved chunks and is explicitly instructed to answer *only* from them. This drastically reduces hallucination, at the cost of sometimes saying "I don't know" when the context is thin.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4 |
| **Backend** | NestJS 11, TypeScript, Passport JWT |
| **Database** | PostgreSQL 17 (Supabase), `pgvector`, Prisma 7 |
| **Queue** | BullMQ 5 on Redis (Upstash) |
| **AI / LLM** | Google Gemini (`gemini-embedding-001`, `gemini-2.5-flash`) via LangChain.js |
| **File Parsing** | `pdf-parse`, `RecursiveCharacterTextSplitter` |
| **Auth** | bcrypt, `@nestjs/jwt`, `passport-jwt` |

---

## Screenshots

> Replace these with real screenshots after deployment.

| Screen | Preview |
|---|---|
| Login / Signup | `docs/screenshots/auth.png` |
| Workspace list | `docs/screenshots/workspaces.png` |
| Document upload + status | `docs/screenshots/upload.png` |
| RAG Q&A with sources | `docs/screenshots/qa.png` |

---

## Getting Started

### Prerequisites

- **Node.js** 20 LTS or 22 LTS
- **PostgreSQL** database with the `vector` extension (recommended: [Supabase](https://supabase.com) free tier)
- **Redis** (recommended: [Upstash](https://upstash.com) free tier — works over TLS, no Docker needed)
- **Google AI Studio API key** ([get one free](https://aistudio.google.com/app/apikey))

### Environment Variables

#### `backend/.env`

```env
# Postgres — use the pooled URL for the app and the direct URL for migrations
DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres"

# Auth
JWT_SECRET="generate-a-long-random-string"

# Queue (must be rediss:// for Upstash TLS)
REDIS_URL="rediss://default:[password]@[host].upstash.io:6379"

# AI
GOOGLE_API_KEY="your-google-ai-studio-key"
```

#### `frontend/.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

### Backend Setup

```bash
cd backend
npm install

# Enable pgvector (run once in your Supabase SQL editor)
# CREATE EXTENSION IF NOT EXISTS vector;

npx prisma generate
npx prisma migrate dev
npm run start:dev
# → running on http://localhost:3001/api
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
# → running on http://localhost:3000
```

Open [http://localhost:3000](http://localhost:3000), sign up, create a workspace, upload a PDF, and ask a question.

---

## How It Works

### Ingestion pipeline

1. **Upload** — `POST /api/workspaces/:id/documents` accepts a PDF or text file, saves it to disk (`backend/uploads/`), creates a `Document` row with `status = "pending"`, and enqueues a job.
2. **Worker pickup** — the BullMQ processor (`IngestionProcessor`) picks up the job and sets `status = "processing"`.
3. **Extract** — `pdf-parse` (via LangChain's `PDFLoader`) extracts raw text from the PDF, or `fs.readFile` for plain text.
4. **Chunk** — `RecursiveCharacterTextSplitter` splits the text into ~1000-character chunks with 100-character overlap, preserving sentence boundaries where possible.
5. **Embed** — chunks are embedded in batches of 20 using `gemini-embedding-001` with `outputDimensionality: 1536`.
6. **Store** — each chunk and its vector are inserted into `DocumentChunk` via raw SQL (`$executeRaw` with `::vector` cast — Prisma doesn't natively write vector columns).
7. **Finalize** — `Document.status` is set to `"ready"`, or `"failed"` with an error message if anything throws.

### Q&A pipeline

1. **Embed the question** — same model, same 1536 dimensions.
2. **Retrieve** — cosine similarity search over the workspace's chunks:
   ```sql
   SELECT ..., embedding <=> $questionVector::vector AS distance
   FROM "DocumentChunk" dc
   JOIN "Document" d ON d.id = dc."documentId"
   WHERE d."workspaceId" = $1 AND d.status = 'ready'
   ORDER BY embedding <=> $questionVector::vector
   LIMIT 5
   ```
   The `<=>` operator is cosine distance; we convert to similarity via `1 - distance`.
3. **Generate** — the top-5 chunks are injected into a prompt that instructs the model to answer *only* from those chunks and to cite them as `[1]`, `[2]`, etc.
4. **Respond** — the API returns both the generated answer and the source chunks (with document name, chunk index, and similarity score) so the UI can show provenance.

---

## API Reference

All workspace and document endpoints require an `Authorization: Bearer <token>` header.

### Auth

| Method | Path | Body | Description |
|---|---|---|---|
| `POST` | `/auth/signup` | `{ email, password, name? }` | Create account |
| `POST` | `/auth/login` | `{ email, password }` | Get JWT + user |
| `GET` | `/auth/me` | — | Get current user |

### Workspaces

| Method | Path | Body | Description |
|---|---|---|---|
| `POST` | `/workspaces` | `{ name }` | Create workspace (caller becomes owner) |
| `GET` | `/workspaces` | — | List workspaces the caller belongs to |
| `GET` | `/workspaces/:id` | — | Get one workspace |

### Documents

| Method | Path | Body | Description |
|---|---|---|---|
| `POST` | `/workspaces/:id/documents` | `multipart/form-data` with `file` | Upload and enqueue ingestion |
| `GET` | `/workspaces/:id/documents` | — | List documents in workspace |
| `GET` | `/workspaces/:id/documents/:docId` | — | Get one document (polling for status) |

### Q&A

| Method | Path | Body | Description |
|---|---|---|---|
| `POST` | `/workspaces/:id/ask` | `{ question }` | Retrieve chunks and generate a cited answer |

---

## Project Structure

```
cognibase/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   └── src/
│       ├── auth/                # JWT, signup, login
│       ├── workspaces/          # Multi-tenant workspaces
│       ├── documents/           # Upload + list
│       ├── ingestion/           # BullMQ worker
│       ├── ask/                 # RAG Q&A endpoint
│       ├── prisma.service.ts
│       └── app.module.ts
└── frontend/
    ├── app/
    │   ├── page.tsx             # Landing
    │   ├── login/
    │   ├── signup/
    │   ├── dashboard/           # Workspace list
    │   └── workspaces/[id]/     # Documents + Q&A
    └── lib/
        ├── api.ts               # Typed fetch wrapper
        └── auth-context.tsx     # Auth provider
```

---

## Roadmap

- [x] JWT authentication
- [x] Multi-tenant workspaces with membership checks
- [x] Async PDF ingestion via BullMQ
- [x] Gemini embeddings + pgvector storage
- [x] Semantic Q&A with cited sources
- [ ] Streaming answers (SSE) — token-by-token output in the UI
- [ ] Socket.IO real-time ingestion status (replace 2s polling)
- [ ] Object storage for uploads (Cloudinary / Supabase Storage) — required for persistent deployments
- [ ] Workspace invitations and member management UI
- [ ] Row Level Security in Postgres for defense-in-depth
- [ ] Tests: Jest for NestJS services, Playwright for critical frontend flows

---

## What I'd Improve for Production

This project is built as a portfolio piece, and several deliberate trade-offs were made for learning speed:

| Current | Production-ready |
|---|---|
| JWT in `localStorage` | `httpOnly; Secure; SameSite=Strict` cookies set by the backend |
| Disk storage for uploads | S3 / Cloudinary / Supabase Storage with signed URLs |
| 2-second polling for status | Server-Sent Events or WebSocket push |
| No automated tests | Jest for services, Playwright for e2e, CI on every PR |
| Manual deployment | Docker + GitHub Actions → ECR/Render |
| Application-level tenant isolation | Postgres Row Level Security as a second layer |
| No rate limiting | `@nestjs/throttler` on auth and ask endpoints |
| No observability | Structured logging, OpenTelemetry, error tracking (Sentry) |

---

## License

MIT