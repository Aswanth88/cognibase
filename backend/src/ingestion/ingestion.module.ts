import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { IngestionProcessor } from './ingestion.processor';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'document-ingestion' }),
  ],
  providers: [IngestionProcessor, PrismaService],
})
export class IngestionModule {}