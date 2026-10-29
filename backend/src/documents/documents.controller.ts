import {
  Controller,
  Get,
  Param,
  Post,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DocumentsService } from './documents.service';

const UPLOAD_DIR = join(process.cwd(), 'uploads');

@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/documents')
export class DocumentsController {
  constructor(private documents: DocumentsService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: UPLOAD_DIR,
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `${unique}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
    }),
  )
  upload(
    @Request() req: any,
    @Param('workspaceId') workspaceId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.documents.upload(req.user.id, workspaceId, file);
  }

  @Get()
  list(@Request() req: any, @Param('workspaceId') workspaceId: string) {
    return this.documents.listForWorkspace(req.user.id, workspaceId);
  }

  @Get(':documentId')
  findOne(@Request() req: any, @Param('documentId') documentId: string) {
    return this.documents.findOne(req.user.id, documentId);
  }
}