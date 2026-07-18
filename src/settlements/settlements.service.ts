import { Injectable } from '@nestjs/common';
import {
  AttachmentEntityType,
  AttachmentStatus,
  GroupSettlementStatus,
  LedgerSourceType,
  SettlementStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError } from '../common/errors/api-error';
import { ErrorCodes } from '../common/errors/error-codes';
import { requireInternalUser } from '../common/users/resolve-user';
import { MembershipService } from '../groups/membership.service';
import { LedgerService } from '../ledger/ledger.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateSettlementDto } from './dto/create-settlement.dto';

@Injectable()
export class SettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membership: MembershipService,
    private readonly ledger: LedgerService,
    private readonly notifications: NotificationsService,
  ) {}

  private map(
    s: {
      id: string;
      groupId: string;
      fromUserId: string;
      toUserId: string;
      amountMinor: number;
      currencyCode: string;
      settlementDate: Date;
      notes: string | null;
      status: SettlementStatus;
      createdById: string;
      confirmedById: string | null;
      confirmedAt: Date | null;
      disputeReason: string | null;
      version: number;
      createdAt: Date;
      updatedAt: Date;
    },
    attachmentIds: string[] = [],
  ) {
    return {
      id: s.id,
      groupId: s.groupId,
      fromUserId: s.fromUserId,
      toUserId: s.toUserId,
      amountMinor: s.amountMinor,
      currencyCode: s.currencyCode,
      settlementDate: s.settlementDate.toISOString().slice(0, 10),
      notes: s.notes,
      status: s.status,
      createdById: s.createdById,
      confirmedById: s.confirmedById,
      confirmedAt: s.confirmedAt?.toISOString() ?? null,
      disputeReason: s.disputeReason,
      version: s.version,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      attachmentIds,
    };
  }

  private async attachmentIdsFor(
    groupId: string,
    entityIds: string[],
  ): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (entityIds.length === 0) return map;
    const rows = await this.prisma.mediaAttachment.findMany({
      where: {
        groupId,
        entityType: AttachmentEntityType.SETTLEMENT,
        entityId: { in: entityIds },
        deletedAt: null,
        status: AttachmentStatus.READY,
      },
      select: { id: true, entityId: true },
      orderBy: { createdAt: 'asc' },
    });
    for (const r of rows) {
      if (!r.entityId) continue;
      const list = map.get(r.entityId) ?? [];
      list.push(r.id);
      map.set(r.entityId, list);
    }
    return map;
  }

  async list(authSubjectId: string, groupId: string) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    await this.membership.requireMember(groupId, user.id);
    const rows = await this.prisma.settlement.findMany({
      where: { groupId, deletedAt: null },
      orderBy: [{ settlementDate: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });
    const att = await this.attachmentIdsFor(
      groupId,
      rows.map((r) => r.id),
    );
    return rows.map((r) => this.map(r, att.get(r.id) ?? []));
  }

  async get(authSubjectId: string, groupId: string, settlementId: string) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    await this.membership.requireMember(groupId, user.id);
    const row = await this.prisma.settlement.findFirst({
      where: { id: settlementId, groupId, deletedAt: null },
    });
    if (!row) {
      throw ApiError.notFound(
        ErrorCodes.SETTLEMENT_NOT_FOUND,
        'Pembayaran tidak ditemukan.',
      );
    }
    const att = await this.attachmentIdsFor(groupId, [row.id]);
    return this.map(row, att.get(row.id) ?? []);
  }

  async create(authSubjectId: string, groupId: string, dto: CreateSettlementDto) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    const ctx = await this.membership.requireMember(groupId, user.id, {
      write: true,
    });
    if (dto.fromUserId === dto.toUserId) {
      throw new ApiError(
        ErrorCodes.VALIDATION_FAILED,
        'Pengirim dan penerima harus berbeda.',
        400,
      );
    }
    await this.membership.requireActiveMemberIds(groupId, [
      dto.fromUserId,
      dto.toUserId,
    ]);

    const group = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
    });

    if (!group.allowOverpayment) {
      const fromBalance = await this.ledger.getMemberBalance(
        groupId,
        dto.fromUserId,
      );
      // fromUser should pay when balance negative; amount shouldn't exceed |balance|
      if (fromBalance >= 0 || dto.amountMinor > Math.abs(fromBalance)) {
        throw new ApiError(
          ErrorCodes.VALIDATION_FAILED,
          'Nominal melebihi utang atau saldo tidak memerlukan pembayaran.',
          400,
          { balanceMinor: fromBalance },
        );
      }
    }

    const status = group.requireSettlementConfirmation
      ? SettlementStatus.PENDING_CONFIRMATION
      : SettlementStatus.CONFIRMED;

    const expireDays = Number(process.env.SETTLEMENT_EXPIRE_DAYS || 14);
    const expiresAt =
      status === SettlementStatus.PENDING_CONFIRMATION
        ? new Date(Date.now() + expireDays * 24 * 60 * 60 * 1000)
        : null;

    const settlement = await this.prisma.$transaction(async (tx) => {
      const created = await tx.settlement.create({
        data: {
          groupId,
          fromUserId: dto.fromUserId,
          toUserId: dto.toUserId,
          amountMinor: dto.amountMinor,
          currencyCode: ctx.currencyCode,
          settlementDate: new Date(dto.settlementDate),
          notes: dto.notes?.trim() || null,
          status,
          expiresAt,
          createdById: user.id,
          confirmedById:
            status === SettlementStatus.CONFIRMED ? dto.toUserId : null,
          confirmedAt:
            status === SettlementStatus.CONFIRMED ? new Date() : null,
        },
      });

      if (dto.attachmentIds?.length) {
        await tx.mediaAttachment.updateMany({
          where: {
            id: { in: dto.attachmentIds },
            groupId,
            status: AttachmentStatus.READY,
            deletedAt: null,
          },
          data: {
            entityType: AttachmentEntityType.SETTLEMENT,
            entityId: created.id,
          },
        });
      }

      if (status === SettlementStatus.CONFIRMED) {
        await this.ledger.post(tx, {
          groupId,
          sourceType: LedgerSourceType.SETTLEMENT,
          sourceId: created.id,
          currencyCode: ctx.currencyCode,
          deltas: [
            { userId: dto.fromUserId, amountMinorSigned: dto.amountMinor },
            { userId: dto.toUserId, amountMinorSigned: -dto.amountMinor },
          ],
        });
      }

      await tx.activityEvent.create({
        data: {
          groupId,
          actorUserId: user.id,
          eventType: 'settlement.created',
          entityType: 'settlement',
          entityId: created.id,
          payload: { amountMinor: dto.amountMinor, status },
        },
      });

      return created;
    });

    if (status === SettlementStatus.PENDING_CONFIRMATION) {
      await this.notifications.create({
        userId: dto.toUserId,
        type: 'settlement.pending',
        groupId,
        actorUserId: user.id,
        entityType: 'settlement',
        entityId: settlement.id,
        payload: { amountMinor: dto.amountMinor },
      });
    } else {
      await this.notifications.create({
        userId: dto.fromUserId,
        type: 'settlement.confirmed',
        groupId,
        actorUserId: user.id,
        entityType: 'settlement',
        entityId: settlement.id,
        payload: { amountMinor: dto.amountMinor },
      });
      await this.evaluateAllSettled(groupId, user.id);
    }

    return this.map(settlement);
  }

  async confirm(
    authSubjectId: string,
    groupId: string,
    settlementId: string,
  ) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    await this.membership.requireMember(groupId, user.id, { write: true });

    const existing = await this.prisma.settlement.findFirst({
      where: { id: settlementId, groupId, deletedAt: null },
    });
    if (!existing) {
      throw ApiError.notFound(
        ErrorCodes.SETTLEMENT_NOT_FOUND,
        'Pembayaran tidak ditemukan.',
      );
    }
    if (existing.toUserId !== user.id) {
      throw new ApiError(
        ErrorCodes.SETTLEMENT_FORBIDDEN,
        'Hanya penerima yang dapat mengonfirmasi.',
        403,
      );
    }
    if (existing.status !== SettlementStatus.PENDING_CONFIRMATION) {
      throw new ApiError(
        ErrorCodes.SETTLEMENT_ALREADY_RESOLVED,
        'Pembayaran sudah diproses.',
        400,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.settlement.update({
        where: { id: settlementId },
        data: {
          status: SettlementStatus.CONFIRMED,
          confirmedById: user.id,
          confirmedAt: new Date(),
          version: { increment: 1 },
        },
      });

      await this.ledger.post(tx, {
        groupId,
        sourceType: LedgerSourceType.SETTLEMENT,
        sourceId: settlementId,
        currencyCode: row.currencyCode,
        deltas: [
          { userId: row.fromUserId, amountMinorSigned: row.amountMinor },
          { userId: row.toUserId, amountMinorSigned: -row.amountMinor },
        ],
      });

      await tx.activityEvent.create({
        data: {
          groupId,
          actorUserId: user.id,
          eventType: 'settlement.confirmed',
          entityType: 'settlement',
          entityId: settlementId,
        },
      });

      return row;
    });

    await this.notifications.create({
      userId: updated.fromUserId,
      type: 'settlement.confirmed',
      groupId,
      actorUserId: user.id,
      entityType: 'settlement',
      entityId: settlementId,
      payload: { amountMinor: updated.amountMinor },
    });

    await this.evaluateAllSettled(groupId, user.id);
    return this.map(updated);
  }

  async dispute(
    authSubjectId: string,
    groupId: string,
    settlementId: string,
    reason: string,
  ) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    await this.membership.requireMember(groupId, user.id, { write: true });

    const existing = await this.prisma.settlement.findFirst({
      where: { id: settlementId, groupId, deletedAt: null },
    });
    if (!existing) {
      throw ApiError.notFound(
        ErrorCodes.SETTLEMENT_NOT_FOUND,
        'Pembayaran tidak ditemukan.',
      );
    }
    if (existing.toUserId !== user.id) {
      throw new ApiError(
        ErrorCodes.SETTLEMENT_FORBIDDEN,
        'Hanya penerima yang dapat menolak.',
        403,
      );
    }
    if (existing.status !== SettlementStatus.PENDING_CONFIRMATION) {
      throw new ApiError(
        ErrorCodes.SETTLEMENT_ALREADY_RESOLVED,
        'Pembayaran sudah diproses.',
        400,
      );
    }

    const updated = await this.prisma.settlement.update({
      where: { id: settlementId },
      data: {
        status: SettlementStatus.DISPUTED,
        disputeReason: reason.trim(),
        version: { increment: 1 },
      },
    });

    await this.prisma.activityEvent.create({
      data: {
        groupId,
        actorUserId: user.id,
        eventType: 'settlement.disputed',
        entityType: 'settlement',
        entityId: settlementId,
        payload: { reason: reason.trim() },
      },
    });

    await this.notifications.create({
      userId: updated.fromUserId,
      type: 'settlement.disputed',
      groupId,
      actorUserId: user.id,
      entityType: 'settlement',
      entityId: settlementId,
      payload: { reason: reason.trim() },
    });

    return this.map(updated);
  }

  async cancel(
    authSubjectId: string,
    groupId: string,
    settlementId: string,
  ) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    await this.membership.requireMember(groupId, user.id, { write: true });

    const existing = await this.prisma.settlement.findFirst({
      where: { id: settlementId, groupId, deletedAt: null },
    });
    if (!existing) {
      throw ApiError.notFound(
        ErrorCodes.SETTLEMENT_NOT_FOUND,
        'Pembayaran tidak ditemukan.',
      );
    }
    if (
      existing.createdById !== user.id &&
      existing.fromUserId !== user.id
    ) {
      throw ApiError.forbidden('Tidak dapat membatalkan pembayaran ini.');
    }
    if (existing.status !== SettlementStatus.PENDING_CONFIRMATION) {
      throw new ApiError(
        ErrorCodes.SETTLEMENT_ALREADY_RESOLVED,
        'Hanya pembayaran pending yang dapat dibatalkan.',
        400,
      );
    }

    const updated = await this.prisma.settlement.update({
      where: { id: settlementId },
      data: {
        status: SettlementStatus.CANCELLED,
        version: { increment: 1 },
      },
    });
    return this.map(updated);
  }

  async getSettlementState(authSubjectId: string, groupId: string) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    await this.membership.requireMember(groupId, user.id);
    const state = await this.prisma.groupSettlementState.findUnique({
      where: { groupId },
    });
    return {
      groupId,
      status: state?.status ?? GroupSettlementStatus.ACTIVE,
      lastAllSettledAt: state?.lastAllSettledAt?.toISOString() ?? null,
    };
  }

  async evaluateAllSettled(groupId: string, actorUserId?: string) {
    const balances = await this.ledger.getGroupBalances(groupId);
    const allZero = balances.every((b) => b.balanceMinor === 0);
    const pending = await this.prisma.settlement.count({
      where: {
        groupId,
        deletedAt: null,
        status: {
          in: [
            SettlementStatus.PENDING_CONFIRMATION,
            SettlementStatus.DISPUTED,
          ],
        },
      },
    });

    const shouldSettle = allZero && pending === 0;
    const existing = await this.prisma.groupSettlementState.findUnique({
      where: { groupId },
    });

    if (shouldSettle) {
      if (existing?.status === GroupSettlementStatus.ALL_SETTLED) {
        return { status: GroupSettlementStatus.ALL_SETTLED, transitioned: false };
      }
      await this.prisma.groupSettlementState.upsert({
        where: { groupId },
        create: {
          groupId,
          status: GroupSettlementStatus.ALL_SETTLED,
          lastAllSettledAt: new Date(),
        },
        update: {
          status: GroupSettlementStatus.ALL_SETTLED,
          lastAllSettledAt: new Date(),
          stateVersion: { increment: 1 },
        },
      });
      await this.prisma.activityEvent.create({
        data: {
          groupId,
          actorUserId,
          eventType: 'group.all_settled',
          entityType: 'group',
          entityId: groupId,
        },
      });
      const members = await this.prisma.groupMember.findMany({
        where: { groupId, status: 'ACTIVE' },
      });
      for (const m of members) {
        await this.notifications.create({
          userId: m.userId,
          type: 'group.all_settled',
          groupId,
          actorUserId,
          entityType: 'group',
          entityId: groupId,
        });
      }
      return { status: GroupSettlementStatus.ALL_SETTLED, transitioned: true };
    }

    if (existing?.status === GroupSettlementStatus.ALL_SETTLED) {
      await this.prisma.groupSettlementState.update({
        where: { groupId },
        data: {
          status: GroupSettlementStatus.ACTIVE,
          stateVersion: { increment: 1 },
        },
      });
    } else if (!existing) {
      await this.prisma.groupSettlementState.create({
        data: { groupId, status: GroupSettlementStatus.ACTIVE },
      });
    }

    return { status: GroupSettlementStatus.ACTIVE, transitioned: false };
  }
}
