import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { PrismaService } from '../prisma.service';
import { WorkspacesModule } from '../workspaces/workspaces.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'document-ingestion' }),
    WorkspacesModule,
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService, PrismaService],
})
export class DocumentsModule {}