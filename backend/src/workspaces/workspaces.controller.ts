import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspacesService } from './workspaces.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';

@UseGuards(JwtAuthGuard)
@Controller('workspaces')
export class WorkspacesController {
  constructor(private workspaces: WorkspacesService) {}

  @Post()
  create(@Request() req: any, @Body() dto: CreateWorkspaceDto) {
    return this.workspaces.create(req.user.id, dto.name);
  }

  @Get()
  findAll(@Request() req: any) {
    return this.workspaces.findAllForUser(req.user.id);
  }

  @Get(':id')
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.workspaces.findOneForUser(req.user.id, id);
  }
}