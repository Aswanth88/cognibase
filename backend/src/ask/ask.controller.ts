import { Body, Controller, Param, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AskService } from './ask.service';
import { AskDto } from './dto/ask.dto';

@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/ask')
export class AskController {
  constructor(private askService: AskService) {}

  @Post()
  ask(
    @Request() req: any,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: AskDto,
  ) {
    return this.askService.ask(req.user.id, workspaceId, dto.question);
  }
}