import { Injectable } from '@nestjs/common';
import {
  MemberRole,
  MemberStatus,
  ReactionType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError } from '../common/errors/api-error';
import { ErrorCodes } from '../common/errors/error-codes';
import { generateToken, hashToken } from '../common/crypto/token';
import { requireInternalUser } from '../common/users/resolve-user';
import { MembershipService } from '../groups/membership.service';
import { LedgerService } from '../ledger/ledger.service';
import { NotificationsService } from '../notifications/notifications.service';

const MENTION_RE = /@\[([^\]]+)\]\(([a-z0-9]+)\)|@(\w+)/gi;

@Injectable()
export class SocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membership: MembershipService,
    private readonly ledger: LedgerService,
    private readonly notifications: NotificationsService,
  ) {}

  async listComments(
    clerkUserId: string,
    groupId: string,
    entityType: string,
    entityId: string,
  ) {
    const user = await requireInternalUser(this.prisma, clerkUserId);
    await this.membership.requireMember(groupId, user.id);
    const rows = await this.prisma.comment.findMany({
      where: { groupId, entityType, entityId, deletedAt: null },
      include: {
        author: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
        mentions: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    return rows.map((c) => ({
      id: c.id,
      body: c.body,
      author: c.author,
      editedAt: c.editedAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
      mentionUserIds: c.mentions.map((m) => m.mentionedUserId),
    }));
  }

  async createComment(
    clerkUserId: string,
    groupId: string,
    entityType: string,
    entityId: string,
    body: string,
  ) {
    const user = await requireInternalUser(this.prisma, clerkUserId);
    await this.membership.requireMember(groupId, user.id, { write: true });
    if (body.trim().length === 0 || body.length > 2000) {
      throw new ApiError(
        ErrorCodes.VALIDATION_FAILED,
        'Komentar 1–2000 karakter.',
        400,
      );
    }

    const members = await this.prisma.groupMember.findMany({
      where: { groupId, status: MemberStatus.ACTIVE },
      include: { user: true },
    });
    const byId = new Map(members.map((m) => [m.userId, m.user]));
    const byName = new Map(
      members.map((m) => [m.user.displayName.toLowerCase(), m.user]),
    );

    const mentionedIds = new Set<string>();
    let match: RegExpExecArray | null;
    const re = new RegExp(MENTION_RE.source, 'gi');
    while ((match = re.exec(body)) !== null) {
      const id = match[2];
      const name = match[3];
      if (id && byId.has(id)) mentionedIds.add(id);
      else if (name) {
        const u = byName.get(name.toLowerCase());
        if (u) mentionedIds.add(u.id);
      }
    }

    const comment = await this.prisma.comment.create({
      data: {
        groupId,
        entityType,
        entityId,
        authorUserId: user.id,
        body: body.trim(),
        mentions: {
          create: [...mentionedIds].map((mentionedUserId) => ({
            mentionedUserId,
            notifiedAt: new Date(),
          })),
        },
      },
      include: {
        author: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
        mentions: true,
      },
    });

    await this.prisma.activityEvent.create({
      data: {
        groupId,
        actorUserId: user.id,
        eventType: 'comment.created',
        entityType,
        entityId,
        payload: { commentId: comment.id },
      },
    });

    for (const mentionedUserId of mentionedIds) {
      if (mentionedUserId === user.id) continue;
      await this.notifications.create({
        userId: mentionedUserId,
        type: 'comment.mention',
        groupId,
        actorUserId: user.id,
        entityType,
        entityId,
        payload: { commentId: comment.id },
      });
    }

    return {
      id: comment.id,
      body: comment.body,
      author: comment.author,
      editedAt: null,
      createdAt: comment.createdAt.toISOString(),
      mentionUserIds: comment.mentions.map((m) => m.mentionedUserId),
    };
  }

  async deleteComment(
    clerkUserId: string,
    groupId: string,
    commentId: string,
  ) {
    const user = await requireInternalUser(this.prisma, clerkUserId);
    const ctx = await this.membership.requireMember(groupId, user.id, {
      write: true,
    });
    const comment = await this.prisma.comment.findFirst({
      where: { id: commentId, groupId, deletedAt: null },
    });
    if (!comment) {
      throw ApiError.notFound(ErrorCodes.COMMENT_NOT_FOUND, 'Komentar tidak ditemukan.');
    }
    if (
      comment.authorUserId !== user.id &&
      ctx.role === MemberRole.MEMBER
    ) {
      throw ApiError.forbidden('Tidak dapat menghapus komentar ini.');
    }
    await this.prisma.comment.update({
      where: { id: commentId },
      data: { deletedAt: new Date() },
    });
    return { ok: true };
  }

  async setReaction(
    clerkUserId: string,
    groupId: string,
    entityType: string,
    entityId: string,
    reactionType: ReactionType,
  ) {
    const user = await requireInternalUser(this.prisma, clerkUserId);
    await this.membership.requireMember(groupId, user.id, { write: true });

    const reaction = await this.prisma.reaction.upsert({
      where: {
        entityType_entityId_userId: {
          entityType,
          entityId,
          userId: user.id,
        },
      },
      create: {
        groupId,
        entityType,
        entityId,
        userId: user.id,
        reactionType,
      },
      update: { reactionType },
    });

    return {
      id: reaction.id,
      reactionType: reaction.reactionType,
      userId: reaction.userId,
    };
  }

  async removeReaction(
    clerkUserId: string,
    groupId: string,
    entityType: string,
    entityId: string,
  ) {
    const user = await requireInternalUser(this.prisma, clerkUserId);
    await this.membership.requireMember(groupId, user.id, { write: true });
    await this.prisma.reaction.deleteMany({
      where: { groupId, entityType, entityId, userId: user.id },
    });
    return { ok: true };
  }

  async listReactions(
    clerkUserId: string,
    groupId: string,
    entityType: string,
    entityId: string,
  ) {
    const user = await requireInternalUser(this.prisma, clerkUserId);
    await this.membership.requireMember(groupId, user.id);
    const rows = await this.prisma.reaction.findMany({
      where: { groupId, entityType, entityId },
      include: {
        user: { select: { id: true, displayName: true } },
      },
    });
    return rows.map((r) => ({
      userId: r.userId,
      displayName: r.user.displayName,
      reactionType: r.reactionType,
    }));
  }

  async createReminder(
    clerkUserId: string,
    groupId: string,
    recipientUserId: string,
  ) {
    const user = await requireInternalUser(this.prisma, clerkUserId);
    await this.membership.requireMember(groupId, user.id, { write: true });
    await this.membership.requireActiveMemberIds(groupId, [recipientUserId]);

    const balance = await this.ledger.getMemberBalance(
      groupId,
      recipientUserId,
    );
    if (balance >= 0) {
      throw new ApiError(
        ErrorCodes.VALIDATION_FAILED,
        'Penerima tidak memiliki utang aktif.',
        400,
      );
    }

    const cooldownMs = 24 * 60 * 60 * 1000;
    const recent = await this.prisma.paymentReminder.findFirst({
      where: {
        groupId,
        senderUserId: user.id,
        recipientUserId,
        createdAt: { gte: new Date(Date.now() - cooldownMs) },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      throw new ApiError(
        ErrorCodes.REMINDER_COOLDOWN_ACTIVE,
        'Pengingat sudah dikirim. Tunggu 24 jam.',
        429,
        { lastSentAt: recent.createdAt.toISOString() },
      );
    }

    const reminder = await this.prisma.paymentReminder.create({
      data: {
        groupId,
        senderUserId: user.id,
        recipientUserId,
        amountMinorSnapshot: Math.abs(balance),
        channel: 'IN_APP',
      },
    });

    await this.notifications.create({
      userId: recipientUserId,
      type: 'payment.reminder',
      groupId,
      actorUserId: user.id,
      entityType: 'reminder',
      entityId: reminder.id,
      payload: { amountMinor: Math.abs(balance) },
    });

    await this.prisma.activityEvent.create({
      data: {
        groupId,
        actorUserId: user.id,
        eventType: 'reminder.sent',
        entityType: 'reminder',
        entityId: reminder.id,
        payload: { recipientUserId },
      },
    });

    return {
      id: reminder.id,
      amountMinor: Math.abs(balance),
      createdAt: reminder.createdAt.toISOString(),
    };
  }

  async createWhatsappLink(
    clerkUserId: string,
    groupId: string,
    recipientUserId: string,
  ) {
    const user = await requireInternalUser(this.prisma, clerkUserId);
    await this.membership.requireMember(groupId, user.id, { write: true });
    await this.membership.requireActiveMemberIds(groupId, [recipientUserId]);

    const group = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
    });
    const recipient = await this.prisma.user.findUniqueOrThrow({
      where: { id: recipientUserId },
    });
    const balance = await this.ledger.getMemberBalance(
      groupId,
      recipientUserId,
    );
    const amount = Math.max(Math.abs(balance), 0);
    const amountLabel = new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: group.currencyCode || 'IDR',
      maximumFractionDigits: 0,
    }).format(amount);

    const token = generateToken();
    const share = await this.prisma.shareLink.create({
      data: {
        groupId,
        createdById: user.id,
        tokenHash: hashToken(token),
        purpose: 'PAYMENT_REMINDER',
        recipientUserId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const appUrl =
      process.env.APP_URL?.replace(/\/$/, '') || 'http://localhost:3000';
    // frontend origin preferred for share deep link
    const frontend =
      process.env.FRONTEND_ORIGINS?.split(',')[0]?.trim() ||
      'http://localhost:3000';
    const deepLink = `${frontend}/groups/${groupId}/balances?share=${token}`;

    const message = `Hai ${recipient.displayName} 👋\nSaldo kamu di grup “${group.name}” masih ${amountLabel}.\nLihat rinciannya di Bagi Rata: ${deepLink}`;

    await this.prisma.paymentReminder.create({
      data: {
        groupId,
        senderUserId: user.id,
        recipientUserId,
        amountMinorSnapshot: amount,
        channel: 'WHATSAPP',
        shareLinkId: share.id,
      },
    });

    return {
      message,
      whatsappUrl: `https://wa.me/?text=${encodeURIComponent(message)}`,
      deepLink,
      shareLinkId: share.id,
      amountMinor: amount,
    };
  }

  async listActivity(clerkUserId: string, groupId: string) {
    const user = await requireInternalUser(this.prisma, clerkUserId);
    await this.membership.requireMember(groupId, user.id);
    const rows = await this.prisma.activityEvent.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        actor: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });
    return rows.map((a) => ({
      id: a.id,
      eventType: a.eventType,
      entityType: a.entityType,
      entityId: a.entityId,
      payload: a.payload,
      createdAt: a.createdAt.toISOString(),
      actor: a.actor,
    }));
  }
}
