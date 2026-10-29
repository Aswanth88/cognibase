import { Injectable } from '@nestjs/common';
import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { PrismaService } from '../prisma.service';
import { WorkspacesService } from '../workspaces/workspaces.service';

type ChunkRow = {
  chunkId: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  documentName: string;
  distance: number;
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

@Injectable()
export class AskService {
  private embeddings: GoogleGenerativeAIEmbeddings;
  private chat: ChatGoogleGenerativeAI;

  constructor(
    private prisma: PrismaService,
    private workspaces: WorkspacesService,
  ) {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY is not set. Add it to backend/.env.');
    }

    this.embeddings = new GoogleGenerativeAIEmbeddings({
      model: 'gemini-embedding-001',
      apiKey,
      outputDimensionality: 1536, // must match the DB column
    });

    this.chat = new ChatGoogleGenerativeAI({
      model: 'gemini-2.5-flash',
      apiKey,
      temperature: 0.2,
    });
  }

  async ask(
    userId: string,
    workspaceId: string,
    question: string,
    topK = 5,
  ): Promise<AskResult> {
    await this.workspaces.assertMembership(userId, workspaceId);

    const [queryVector] = await this.embeddings.embedDocuments([question]);
    if (!queryVector) throw new Error('Failed to embed question');

    const rows = await this.prisma.$queryRaw<ChunkRow[]>`
      SELECT
        dc.id          AS "chunkId",
        dc."documentId",
        dc."chunkIndex",
        dc.content,
        d.name         AS "documentName",
        dc.embedding <=> ${JSON.stringify(queryVector)}::vector AS distance
      FROM "DocumentChunk" dc
      JOIN "Document" d ON d.id = dc."documentId"
      WHERE d."workspaceId" = ${workspaceId}
        AND d.status = 'ready'
      ORDER BY dc.embedding <=> ${JSON.stringify(queryVector)}::vector
      LIMIT ${topK}
    `;

    if (rows.length === 0) {
      return {
        answer:
          'I could not find any ready documents in this workspace to answer from. Upload a document and wait for it to finish processing.',
        sources: [],
      };
    }

    const sources: AskSource[] = rows.map((r, i) => ({
      index: i + 1,
      chunkId: r.chunkId,
      documentId: r.documentId,
      documentName: r.documentName,
      chunkIndex: r.chunkIndex,
      content: r.content,
      score: 1 - r.distance, // cosine similarity = 1 - cosine distance
    }));

    const sourcesText = sources
      .map(
        (s) =>
          `[${s.index}] (Document: "${s.documentName}", chunk #${s.chunkIndex}):\n${s.content}`,
      )
      .join('\n\n');

    const prompt = `You are a helpful assistant answering questions about a user's documents.
Use ONLY the sources below. If the answer is not contained in them, say you do not know.
Cite the sources you use with bracketed numbers matching the source index, e.g. [1] or [2][3].

Sources:
${sourcesText}

Question: ${question}

Answer:`;

    const response = await this.chat.invoke(prompt);
    const answer =
      typeof response.content === 'string'
        ? response.content
        : response.content
            .map((c) => (typeof c === 'string' ? c : JSON.stringify(c)))
            .join('');

    return { answer, sources };
  }
}