import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import type { PrismaClient } from '@orbitqueue/database';
import { NotFoundError, ConflictError } from '@orbitqueue/shared';

export class ApiKeyService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(userId: string, projectId: string, name: string, expiresInDays?: number) {
    const rawKey = `oq_${nanoid(32)}`;
    const keyHash = await bcrypt.hash(rawKey, 10);
    const prefix = rawKey.slice(0, 11);

    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 86400000)
      : null;

    const apiKey = await this.prisma.apiKey.create({
      data: { userId, projectId, name, keyHash, prefix, expiresAt },
      select: { id: true, name: true, prefix: true, createdAt: true, expiresAt: true },
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        projectId,
        action: 'API_KEY_CREATED',
        resource: 'api_key',
        resourceId: apiKey.id,
      },
    });

    return { ...apiKey, key: rawKey };
  }

  async list(projectId: string) {
    return this.prisma.apiKey.findMany({
      where: { projectId },
      select: { id: true, name: true, prefix: true, lastUsedAt: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revoke(id: string, projectId: string) {
    const key = await this.prisma.apiKey.findFirst({ where: { id, projectId } });
    if (!key) throw new NotFoundError('API key', id);
    await this.prisma.apiKey.delete({ where: { id } });
    return { revoked: true };
  }

  async authenticate(rawKey: string): Promise<{ userId: string; projectId: string | null } | null> {
    if (!rawKey.startsWith('oq_')) return null;

    const prefix = rawKey.slice(0, 11);
    const candidates = await this.prisma.apiKey.findMany({
      where: { prefix },
      take: 5,
    });

    for (const candidate of candidates) {
      const valid = await bcrypt.compare(rawKey, candidate.keyHash);
      if (!valid) continue;
      if (candidate.expiresAt && candidate.expiresAt < new Date()) return null;

      await this.prisma.apiKey.update({
        where: { id: candidate.id },
        data: { lastUsedAt: new Date() },
      });

      return { userId: candidate.userId, projectId: candidate.projectId };
    }

    return null;
  }
}
