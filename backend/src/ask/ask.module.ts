import { Module } from '@nestjs/common';
import { AskController } from './ask.controller';
import { AskService } from './ask.service';
import { PrismaService } from '../prisma.service';
import { WorkspacesModule } from '../workspaces/workspaces.module';

@Module({
  imports: [WorkspacesModule],
  controllers: [AskController],
  providers: [AskService, PrismaService],
})
export class AskModule {}