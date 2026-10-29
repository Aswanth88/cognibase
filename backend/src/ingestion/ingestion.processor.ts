import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma.service';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import {RecursiveCharacterTextSplitter} from '@langchain/textsplitters';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { randomUUID } from 'crypto';
import { readFile } from 'fs/promises';

export type IngestDocumentJob = {
  documentId: string;
  workspaceId: string;
  storagePath: string;
  mimeType: string;
};

type ProcessResult = { documentId: string; chunks: number };

@Processor('document-ingestion')
export class IngestionProcessor extends WorkerHost {
  private embeddings: GoogleGenerativeAIEmbeddings;

  constructor(private prisma: PrismaService) {
    super();
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY is not set. Add it to backend/.env and restart.',
      );
    }
    this.embeddings = new GoogleGenerativeAIEmbeddings({
  model: 'gemini-embedding-001',
  apiKey: process.env.GOOGLE_API_KEY,
  outputDimensionality: 1536, // Force 1536 dims to match the DB column
});
  }

  async process(job: Job<IngestDocumentJob>): Promise<ProcessResult> {
    const { documentId, storagePath, mimeType } = job.data;

    await this.prisma.document.update({
      where: { id: documentId },
      data: { status: 'processing' },
    });

    try {
      const text = await this.extractText(storagePath, mimeType);

      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 100,
      });
      const chunks = await splitter.splitText(text);

      const batchSize = 20;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const vectors = await this.embeddings.embedDocuments(batch);

        for (let j = 0; j < batch.length; j++) {
          const chunkContent = batch[j];
          const vector = vectors[j];
          if (chunkContent === undefined || vector === undefined) {
            continue;
          }

          const chunkIndex = i + j;

          await this.prisma.$executeRaw`
            INSERT INTO "DocumentChunk" ("id", "content", "chunkIndex", "tokenCount", "embedding", "documentId", "createdAt")
            VALUES (
              ${randomUUID()},
              ${chunkContent},
              ${chunkIndex},
              ${Math.ceil(chunkContent.length / 4)},
              ${JSON.stringify(vector)}::vector,
              ${documentId},
              NOW()
            )
          `;
        }
      }

      await this.prisma.document.update({
        where: { id: documentId },
        data: { status: 'ready', error: null },
      });

      return { documentId, chunks: chunks.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await this.prisma.document.update({
        where: { id: documentId },
        data: { status: 'failed', error: message },
      });
      throw err;
    }
  }

  private async extractText(
    storagePath: string,
    mimeType: string,
  ): Promise<string> {
    if (mimeType === 'application/pdf') {
      const loader = new PDFLoader(storagePath);
      const docs = await loader.load();
      return docs.map((d) => d.pageContent).join('\n\n');
    }

    if (mimeType.startsWith('text/')) {
      return readFile(storagePath, 'utf-8');
    }

    throw new Error(`Unsupported file type: ${mimeType}`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<IngestDocumentJob>) {
    console.log(`[ingestion] Job ${job.id ?? '?'} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<IngestDocumentJob>, error: Error) {
    console.error(`[ingestion] Job ${job.id ?? '?'} failed:`, error.message);
  }
}