import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import type { IngestDocumentJob } from '../ingestion/ingestion.processor';

@Injectable()
export class DocumentsService {
  constructor(
    private prisma: PrismaService,
    private workspaces: WorkspacesService,
    @InjectQueue('document-ingestion') private ingestionQueue: Queue,
  ) {}

  async upload(
    userId: string,
    workspaceId: string,
    file: Express.Multer.File,
  ) {
    await this.workspaces.assertMembership(userId, workspaceId);

    const document = await this.prisma.document.create({
      data: {
        name: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storagePath: file.path,
        workspaceId,
        uploadedById: userId,
        status: 'pending',
      },
    });

    const jobData: IngestDocumentJob = {
      documentId: document.id,
      workspaceId,
      storagePath: file.path,
      mimeType: file.mimetype,
    };

    await this.ingestionQueue.add('ingest', jobData, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });

    return document;
  }

  async listForWorkspace(userId: string, workspaceId: string) {
    await this.workspaces.assertMembership(userId, workspaceId);
    return this.prisma.document.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, documentId: string) {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
    });
    if (!doc) throw new NotFoundException('Document not found');
    await this.workspaces.assertMembership(userId, doc.workspaceId);
    return doc;
  }
}