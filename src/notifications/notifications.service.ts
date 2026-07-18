import { Injectable } from '@nestjs/common';
import { NotificationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: {
    userId: string;
    type: string;
    groupId?: string;
    actorUserId?: string;
    entityType?: string;
    entityId?: string;
    payload?: Prisma.InputJsonValue;
  }) {
    return this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        groupId: input.groupId,
        actorUserId: input.actorUserId,
        entityType: input.entityType,
        entityId: input.entityId,
        payload: input.payload,
      },
    });
  }

  async list(userId: string, limit = 50) {
    const rows = await this.prisma.notification.findMany({
      where: { userId, status: { not: NotificationStatus.ARCHIVED } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        actor: { select: { id: true, displayName: true, avatarUrl: true } },
        group: { select: { id: true, name: true, iconEmoji: true } },
      },
    });
    return rows.map((n) => ({
      id: n.id,
      type: n.type,
      status: n.status,
      groupId: n.groupId,
      entityType: n.entityType,
      entityId: n.entityId,
      payload: n.payload,
      createdAt: n.createdAt.toISOString(),
      readAt: n.readAt?.toISOString() ?? null,
      actor: n.actor,
      group: n.group,
    }));
  }

  async unreadCount(userId: string) {
    return this.prisma.notification.count({
      where: { userId, status: NotificationStatus.UNREAD },
    });
  }

  async markRead(userId: string, notificationId: string) {
    await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { status: NotificationStatus.READ, readAt: new Date() },
    });
    return { ok: true };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, status: NotificationStatus.UNREAD },
      data: { status: NotificationStatus.READ, readAt: new Date() },
    });
    return { ok: true };
  }
}
