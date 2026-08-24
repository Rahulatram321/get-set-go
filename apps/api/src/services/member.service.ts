import type { PrismaClient } from '@orbitqueue/database';
import { NotFoundError, ConflictError } from '@orbitqueue/shared';

export class MemberService {
  constructor(private readonly prisma: PrismaClient) {}

  async listOrgMembers(orgId: string) {
    return this.prisma.organizationMember.findMany({
      where: { organizationId: orgId },
      include: { user: { select: { id: true, email: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async inviteToOrg(orgId: string, email: string, role: 'ADMIN' | 'OPERATOR' | 'DEVELOPER' | 'VIEWER', invitedBy: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new NotFoundError('User', email);

    const existing = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId: user.id } },
    });
    if (existing) throw new ConflictError('User is already a member of this organization');

    const member = await this.prisma.organizationMember.create({
      data: { organizationId: orgId, userId: user.id, role },
      include: { user: { select: { id: true, email: true, name: true } } },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: invitedBy,
        action: 'MEMBER_INVITED',
        resource: 'organization_member',
        resourceId: member.id,
        metadata: { email, role, orgId },
      },
    });

    return member;
  }

  async inviteToProject(
    projectId: string,
    email: string,
    role: 'ADMIN' | 'OPERATOR' | 'DEVELOPER' | 'VIEWER',
    invitedBy: string
  ) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new NotFoundError('User', email);

    const existing = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
    });
    if (existing) throw new ConflictError('User is already a member of this project');

    const member = await this.prisma.projectMember.create({
      data: { projectId, userId: user.id, role },
      include: { user: { select: { id: true, email: true, name: true } } },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: invitedBy,
        projectId,
        action: 'MEMBER_INVITED',
        resource: 'project_member',
        resourceId: member.id,
        metadata: { email, role },
      },
    });

    return member;
  }

  async listProjectMembers(projectId: string) {
    return this.prisma.projectMember.findMany({
      where: { projectId },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
  }
}
