import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class WorkspacesService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, name: string) {
    return this.prisma.workspace.create({
      data: {
        name,
        owner: { connect: { id: userId } },
        members: {
          create: {
            user: { connect: { id: userId } },
            role: 'owner',
          },
        },
      },
    });
  }

  async findAllForUser(userId: string) {
    return this.prisma.workspace.findMany({
      where: {
        members: { some: { userId } },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { documents: true, members: true } },
      },
    });
  }

  async findOneForUser(userId: string, workspaceId: string) {
    const workspace = await this.prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        members: { some: { userId } },
      },
      include: {
        _count: { select: { documents: true, members: true } },
      },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    return workspace;
  }

  async assertMembership(userId: string, workspaceId: string) {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!membership) throw new NotFoundException('Workspace not found');
    return membership;
  }
}