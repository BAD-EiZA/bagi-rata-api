import { Injectable } from '@nestjs/common';
import { NotificationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from './push.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  private prefAllows(type: string, user: {
    notifyMentions: boolean;
    notifySettlements: boolean;
    notifyReminders: boolean;
  }): boolean {
    if (type.includes('mention') || type.includes('comment')) {
      return user.notifyMentions;
    }
    if (type.includes('settlement') || type.includes('all_settled')) {
      return user.notifySettlements;
    }
    if (type.includes('reminder')) {
      return user.notifyReminders;
    }
    return true;
  }

  private pushCopy(type: string, payload?: Prisma.InputJsonValue) {
    const p =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    const title = 'Bagi Rata';
    if (type === 'settlement.pending') {
      return {
        title,
        body: 'Ada pembayaran menunggu konfirmasi Anda.',
        url: '/notifications',
      };
    }
    if (type === 'settlement.confirmed') {
      return { title, body: 'Pembayaran dikonfirmasi.', url: '/notifications' };
    }
    if (type === 'settlement.disputed') {
      return { title, body: 'Pembayaran ditolak.', url: '/notifications' };
    }
    if (type === 'payment.reminder') {
      return {
        title,
        body: 'Pengingat: Anda masih punya utang di grup.',
        url: '/notifications',
      };
    }
    if (type === 'comment.mention') {
      return {
        title,
        body: 'Anda disebut di komentar.',
        url: '/notifications',
      };
    }
    if (type === 'group.all_settled') {
      return {
        title,
        body: 'Semua lunas di grup Anda 🎉',
        url: '/notifications',
      };
    }
    return {
      title,
      body: typeof p.message === 'string' ? p.message : 'Pembaruan baru.',
      url: '/notifications',
    };
  }

  async create(input: {
    userId: string;
    type: string;
    groupId?: string;
    actorUserId?: string;
    entityType?: string;
    entityId?: string;
    payload?: Prisma.InputJsonValue;
  }) {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: {
        notifyMentions: true,
        notifySettlements: true,
        notifyReminders: true,
        notifyEmail: true,
      },
    });
    if (user && !this.prefAllows(input.type, user)) {
      return null;
    }

    const row = await this.prisma.notification.create({
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

    void this.push
      .sendToUser(input.userId, this.pushCopy(input.type, input.payload))
      .catch(() => null);

    // ponytail: email delivery via SMTP — add when SMTP_* env set
    if (user?.notifyEmail) {
      // no-op until SMTP configured
    }

    return row;
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
