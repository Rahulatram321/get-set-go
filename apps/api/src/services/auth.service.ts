import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import type { Env } from '@orbitqueue/config';
import type { PrismaClient } from '@orbitqueue/database';
import { AuthenticationError, AuthorizationError } from '@orbitqueue/shared';
import type { OrgRole, ProjectRole } from '@orbitqueue/shared';

const ROLE_HIERARCHY: Record<string, number> = {
  ADMIN: 4,
  OPERATOR: 3,
  DEVELOPER: 2,
  VIEWER: 1,
};

export interface TokenPayload {
  userId: string;
  email: string;
}

export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly env: Env
  ) {}

  async register(email: string, password: string, name: string) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new AuthenticationError('Email already registered');

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await this.prisma.user.create({
      data: { email, passwordHash, name },
      select: { id: true, email: true, name: true, createdAt: true },
    });

    const tokens = await this.generateTokens(user.id, user.email);
    return { user, ...tokens };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new AuthenticationError('Invalid credentials');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new AuthenticationError('Invalid credentials');

    const tokens = await this.generateTokens(user.id, user.email);
    return {
      user: { id: user.id, email: user.email, name: user.name },
      ...tokens,
    };
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
  }

  async refresh(refreshToken: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new AuthenticationError('Invalid refresh token');
    }

    await this.prisma.refreshToken.delete({ where: { id: stored.id } });
    return this.generateTokens(stored.userId, stored.user.email);
  }

  verifyAccessToken(token: string): TokenPayload {
    try {
      return jwt.verify(token, this.env.JWT_SECRET) as TokenPayload;
    } catch {
      throw new AuthenticationError('Invalid or expired token');
    }
  }

  private async generateTokens(userId: string, email: string) {
    const accessToken = jwt.sign({ userId, email }, this.env.JWT_SECRET, {
      expiresIn: this.env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
    });

    const refreshToken = nanoid(64);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await this.prisma.refreshToken.create({
      data: { token: refreshToken, userId, expiresAt },
    });

    return { accessToken, refreshToken };
  }
}

export class RbacService {
  constructor(private readonly prisma: PrismaClient) {}

  async checkOrgAccess(userId: string, orgId: string, minRole: OrgRole = 'VIEWER') {
    const member = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId } },
    });
    if (!member || ROLE_HIERARCHY[member.role] < ROLE_HIERARCHY[minRole]) {
      throw new AuthorizationError('Insufficient organization permissions');
    }
    return member;
  }

  async checkProjectAccess(userId: string, projectId: string, minRole: ProjectRole = 'VIEWER') {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new AuthorizationError('Project not found');

    const orgMember = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId: project.organizationId, userId },
      },
    });

    if (orgMember && orgMember.role === 'ADMIN') return { role: 'ADMIN' as ProjectRole, project };

    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });

    if (!member && !orgMember) throw new AuthorizationError('No access to this project');
    if (member && ROLE_HIERARCHY[member.role] < ROLE_HIERARCHY[minRole]) {
      throw new AuthorizationError('Insufficient project permissions');
    }

    return { role: member?.role ?? orgMember!.role, project };
  }
}
