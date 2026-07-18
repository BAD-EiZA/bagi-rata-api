import { Injectable } from '@nestjs/common';
import {
  GroupStatus,
  MemberRole,
  MemberStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError } from '../common/errors/api-error';
import { ErrorCodes } from '../common/errors/error-codes';
import { generateToken, hashToken } from '../common/crypto/token';
import { requireInternalUser } from '../common/users/resolve-user';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { MembershipService } from './membership.service';
import { LedgerService } from '../ledger/ledger.service';

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membership: MembershipService,
    private readonly ledger: LedgerService,
  ) {}

  private mapGroup(
    group: {
      id: string;
      name: string;
      description: string | null;
      type: string;
      currencyCode: string;
      timezone: string;
      iconEmoji: string | null;
      status: GroupStatus;
      requireSettlementConfirmation: boolean;
      allowMemberInvites: boolean;
      allowOverpayment: boolean;
      budgetEnabled: boolean;
      createdById: string;
      createdAt: Date;
      updatedAt: Date;
    },
    extra?: Record<string, unknown>,
  ) {
    return {
      id: group.id,
      name: group.name,
      description: group.description,
      type: group.type,
      currencyCode: group.currencyCode,
      timezone: group.timezone,
      iconEmoji: group.iconEmoji,
      status: group.status,
      requireSettlementConfirmation: group.requireSettlementConfirmation,
      allowMemberInvites: group.allowMemberInvites,
      allowOverpayment: group.allowOverpayment,
      budgetEnabled: group.budgetEnabled,
      createdById: group.createdById,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
      ...extra,
    };
  }

  async list(authSubjectId: string) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    const memberships = await this.prisma.groupMember.findMany({
      where: { userId: user.id, status: MemberStatus.ACTIVE },
      include: {
        group: {
          include: {
            _count: {
              select: {
                members: { where: { status: MemberStatus.ACTIVE } },
              },
            },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    return memberships.map((m) =>
      this.mapGroup(m.group, {
        myRole: m.role,
        memberCount: m.group._count.members,
      }),
    );
  }

  async create(authSubjectId: string, dto: CreateGroupDto) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    const group = await this.prisma.$transaction(async (tx) => {
      const created = await tx.group.create({
        data: {
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          type: dto.type,
          currencyCode: (dto.currencyCode ?? 'IDR').toUpperCase(),
          timezone: dto.timezone ?? 'Asia/Jakarta',
          iconEmoji: dto.iconEmoji ?? null,
          requireSettlementConfirmation:
            dto.requireSettlementConfirmation ?? true,
          allowMemberInvites: dto.allowMemberInvites ?? true,
          budgetEnabled: dto.budgetEnabled ?? false,
          createdById: user.id,
        },
      });
      await tx.groupMember.create({
        data: {
          groupId: created.id,
          userId: user.id,
          role: MemberRole.OWNER,
        },
      });
      await tx.activityEvent.create({
        data: {
          groupId: created.id,
          actorUserId: user.id,
          eventType: 'group.created',
          entityType: 'group',
          entityId: created.id,
          payload: { name: created.name },
        },
      });
      return created;
    });
    return this.mapGroup(group, { myRole: MemberRole.OWNER, memberCount: 1 });
  }

  async get(authSubjectId: string, groupId: string) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    const ctx = await this.membership.requireMember(groupId, user.id);
    const group = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      include: {
        _count: {
          select: { members: { where: { status: MemberStatus.ACTIVE } } },
        },
      },
    });
    return this.mapGroup(group, {
      myRole: ctx.role,
      memberCount: group._count.members,
    });
  }

  async update(authSubjectId: string, groupId: string, dto: UpdateGroupDto) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    await this.membership.requireMember(groupId, user.id, {
      write: true,
      roles: [MemberRole.OWNER, MemberRole.ADMIN],
    });

    const group = await this.prisma.group.update({
      where: { id: groupId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
        ...(dto.iconEmoji !== undefined ? { iconEmoji: dto.iconEmoji } : {}),
        ...(dto.requireSettlementConfirmation !== undefined
          ? {
              requireSettlementConfirmation:
                dto.requireSettlementConfirmation,
            }
          : {}),
        ...(dto.allowMemberInvites !== undefined
          ? { allowMemberInvites: dto.allowMemberInvites }
          : {}),
        ...(dto.allowOverpayment !== undefined
          ? { allowOverpayment: dto.allowOverpayment }
          : {}),
        ...(dto.budgetEnabled !== undefined
          ? { budgetEnabled: dto.budgetEnabled }
          : {}),
      },
    });

    await this.prisma.activityEvent.create({
      data: {
        groupId,
        actorUserId: user.id,
        eventType: 'group.updated',
        entityType: 'group',
        entityId: groupId,
        payload: dto as Prisma.InputJsonValue,
      },
    });

    return this.mapGroup(group);
  }

  async archive(authSubjectId: string, groupId: string) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    await this.membership.requireMember(groupId, user.id, {
      write: true,
      roles: [MemberRole.OWNER],
    });
    const group = await this.prisma.group.update({
      where: { id: groupId },
      data: { status: GroupStatus.ARCHIVED },
    });
    return this.mapGroup(group);
  }

  async restore(authSubjectId: string, groupId: string) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    await this.membership.requireMember(groupId, user.id, {
      roles: [MemberRole.OWNER],
    });
    const group = await this.prisma.group.update({
      where: { id: groupId },
      data: { status: GroupStatus.ACTIVE },
    });
    return this.mapGroup(group);
  }

  async listMembers(authSubjectId: string, groupId: string) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    await this.membership.requireMember(groupId, user.id);
    const members = await this.prisma.groupMember.findMany({
      where: { groupId, status: MemberStatus.ACTIVE },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            primaryEmail: true,
          },
        },
      },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    });
    return members.map((m) => ({
      id: m.id,
      userId: m.userId,
      role: m.role,
      joinedAt: m.joinedAt.toISOString(),
      user: m.user,
    }));
  }

  async updateMember(
    authSubjectId: string,
    groupId: string,
    memberId: string,
    dto: UpdateMemberDto,
  ) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    await this.membership.requireMember(groupId, user.id, {
      write: true,
      roles: [MemberRole.OWNER],
    });

    if (dto.role === MemberRole.OWNER) {
      throw new ApiError(
        ErrorCodes.VALIDATION_FAILED,
        'Gunakan transfer ownership untuk menjadikan owner.',
        400,
      );
    }

    const member = await this.prisma.groupMember.findFirst({
      where: { id: memberId, groupId, status: MemberStatus.ACTIVE },
    });
    if (!member) {
      throw ApiError.notFound(ErrorCodes.MEMBER_NOT_FOUND, 'Anggota tidak ditemukan.');
    }
    if (member.role === MemberRole.OWNER) {
      throw new ApiError(
        ErrorCodes.VALIDATION_FAILED,
        'Tidak dapat mengubah role owner.',
        400,
      );
    }

    const updated = await this.prisma.groupMember.update({
      where: { id: member.id },
      data: { role: dto.role },
    });
    return { id: updated.id, userId: updated.userId, role: updated.role };
  }

  async transferOwnership(
    authSubjectId: string,
    groupId: string,
    memberId: string,
  ) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    await this.membership.requireMember(groupId, user.id, {
      write: true,
      roles: [MemberRole.OWNER],
    });

    const target = await this.prisma.groupMember.findFirst({
      where: { id: memberId, groupId, status: MemberStatus.ACTIVE },
    });
    if (!target) {
      throw ApiError.notFound(
        ErrorCodes.MEMBER_NOT_FOUND,
        'Anggota tidak ditemukan.',
      );
    }
    if (target.userId === user.id) {
      throw new ApiError(
        ErrorCodes.VALIDATION_FAILED,
        'Anda sudah menjadi owner.',
        400,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.groupMember.updateMany({
        where: {
          groupId,
          userId: user.id,
          status: MemberStatus.ACTIVE,
        },
        data: { role: MemberRole.ADMIN },
      });
      await tx.groupMember.update({
        where: { id: target.id },
        data: { role: MemberRole.OWNER },
      });
      await tx.activityEvent.create({
        data: {
          groupId,
          actorUserId: user.id,
          eventType: 'member.ownership_transferred',
          entityType: 'member',
          entityId: target.id,
          payload: { toUserId: target.userId },
        },
      });
    });

    return { ok: true, newOwnerUserId: target.userId };
  }

  async removeMember(
    authSubjectId: string,
    groupId: string,
    memberId: string,
  ) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    await this.membership.requireMember(groupId, user.id, {
      write: true,
      roles: [MemberRole.OWNER, MemberRole.ADMIN],
    });

    const member = await this.prisma.groupMember.findFirst({
      where: { id: memberId, groupId, status: MemberStatus.ACTIVE },
    });
    if (!member) {
      throw ApiError.notFound(ErrorCodes.MEMBER_NOT_FOUND, 'Anggota tidak ditemukan.');
    }
    if (member.role === MemberRole.OWNER) {
      const ownerCount = await this.prisma.groupMember.count({
        where: {
          groupId,
          role: MemberRole.OWNER,
          status: MemberStatus.ACTIVE,
        },
      });
      if (ownerCount <= 1) {
        throw new ApiError(
          ErrorCodes.VALIDATION_FAILED,
          'Tidak dapat menghapus satu-satunya owner.',
          400,
        );
      }
    }

    const balance = await this.ledger.getMemberBalance(groupId, member.userId);
    if (balance !== 0) {
      throw new ApiError(
        ErrorCodes.MEMBER_HAS_BALANCE,
        'Anggota masih memiliki saldo. Selesaikan dulu.',
        400,
        { balanceMinor: balance },
      );
    }

    await this.prisma.groupMember.update({
      where: { id: member.id },
      data: { status: MemberStatus.REMOVED, removedAt: new Date() },
    });

    await this.prisma.activityEvent.create({
      data: {
        groupId,
        actorUserId: user.id,
        eventType: 'member.removed',
        entityType: 'member',
        entityId: member.id,
        payload: { userId: member.userId },
      },
    });

    return { ok: true };
  }

  async leave(authSubjectId: string, groupId: string) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    const member = await this.prisma.groupMember.findFirst({
      where: { groupId, userId: user.id, status: MemberStatus.ACTIVE },
    });
    if (!member) {
      throw ApiError.notFound(
        ErrorCodes.MEMBER_NOT_FOUND,
        'Anda bukan anggota grup ini.',
      );
    }
    if (member.role === MemberRole.OWNER) {
      const ownerCount = await this.prisma.groupMember.count({
        where: {
          groupId,
          role: MemberRole.OWNER,
          status: MemberStatus.ACTIVE,
        },
      });
      if (ownerCount <= 1) {
        throw new ApiError(
          ErrorCodes.VALIDATION_FAILED,
          'Transfer ownership dulu sebelum keluar.',
          400,
        );
      }
    }
    const balance = await this.ledger.getMemberBalance(groupId, user.id);
    if (balance !== 0) {
      throw new ApiError(
        ErrorCodes.MEMBER_HAS_BALANCE,
        'Saldo harus 0 sebelum keluar grup.',
        400,
        { balanceMinor: balance },
      );
    }
    await this.prisma.groupMember.update({
      where: { id: member.id },
      data: { status: MemberStatus.REMOVED, removedAt: new Date() },
    });
    await this.prisma.activityEvent.create({
      data: {
        groupId,
        actorUserId: user.id,
        eventType: 'member.left',
        entityType: 'member',
        entityId: member.id,
        payload: { userId: user.id },
      },
    });
    return { ok: true };
  }

  async smartSettle(authSubjectId: string, groupId: string) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    await this.membership.requireMember(groupId, user.id);
    const balances = await this.ledger.getGroupBalances(groupId);
    const debtors = balances
      .filter((b) => b.balanceMinor < 0)
      .map((b) => ({
        userId: b.userId,
        displayName: b.displayName,
        amount: Math.abs(b.balanceMinor),
      }))
      .sort((a, b) => b.amount - a.amount);
    const creditors = balances
      .filter((b) => b.balanceMinor > 0)
      .map((b) => ({
        userId: b.userId,
        displayName: b.displayName,
        amount: b.balanceMinor,
      }))
      .sort((a, b) => b.amount - a.amount);

    const transfers: Array<{
      fromUserId: string;
      fromDisplayName: string;
      toUserId: string;
      toDisplayName: string;
      amountMinor: number;
    }> = [];

    let i = 0;
    let j = 0;
    while (i < debtors.length && j < creditors.length) {
      const pay = Math.min(debtors[i].amount, creditors[j].amount);
      if (pay > 0) {
        transfers.push({
          fromUserId: debtors[i].userId,
          fromDisplayName: debtors[i].displayName,
          toUserId: creditors[j].userId,
          toDisplayName: creditors[j].displayName,
          amountMinor: pay,
        });
        debtors[i].amount -= pay;
        creditors[j].amount -= pay;
      }
      if (debtors[i].amount === 0) i += 1;
      if (creditors[j].amount === 0) j += 1;
    }

    return {
      groupId,
      transfers,
      transferCount: transfers.length,
    };
  }

  async listCategories(authSubjectId: string, groupId: string) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    await this.membership.requireMember(groupId, user.id);
    const rows = await this.prisma.groupCategory.findMany({
      where: { groupId },
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async createCategory(
    authSubjectId: string,
    groupId: string,
    name: string,
  ) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    await this.membership.requireMember(groupId, user.id, { write: true });
    const trimmed = name.trim();
    if (!trimmed) {
      throw new ApiError(
        ErrorCodes.VALIDATION_FAILED,
        'Nama kategori wajib.',
        400,
      );
    }
    const row = await this.prisma.groupCategory.upsert({
      where: { groupId_name: { groupId, name: trimmed } },
      create: { groupId, name: trimmed },
      update: {},
    });
    return {
      id: row.id,
      name: row.name,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async deleteCategory(
    authSubjectId: string,
    groupId: string,
    categoryId: string,
  ) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    await this.membership.requireMember(groupId, user.id, {
      write: true,
      roles: [MemberRole.OWNER, MemberRole.ADMIN],
    });
    await this.prisma.groupCategory.deleteMany({
      where: { id: categoryId, groupId },
    });
    return { ok: true };
  }

  async createInvitation(
    authSubjectId: string,
    groupId: string,
    dto: CreateInvitationDto,
  ) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    const ctx = await this.membership.requireMember(groupId, user.id, {
      write: true,
    });

    const group = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
    });

    if (
      ctx.role === MemberRole.MEMBER &&
      !group.allowMemberInvites
    ) {
      throw ApiError.forbidden('Member tidak diizinkan membuat undangan.');
    }

    if (
      ctx.role !== MemberRole.OWNER &&
      ctx.role !== MemberRole.ADMIN &&
      !group.allowMemberInvites
    ) {
      throw ApiError.forbidden('Izin undangan tidak cukup.');
    }

    const token = generateToken();
    const hours = dto.expiresInHours ?? 168;
    const invitation = await this.prisma.groupInvitation.create({
      data: {
        groupId,
        tokenHash: hashToken(token),
        createdById: user.id,
        expiresAt: new Date(Date.now() + hours * 60 * 60 * 1000),
        maxUses: dto.maxUses ?? null,
      },
    });

    return {
      id: invitation.id,
      token,
      expiresAt: invitation.expiresAt.toISOString(),
      maxUses: invitation.maxUses,
      invitePath: `/invite/${token}`,
    };
  }

  async listInvitations(authSubjectId: string, groupId: string) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    await this.membership.requireMember(groupId, user.id, {
      roles: [MemberRole.OWNER, MemberRole.ADMIN],
    });
    const rows = await this.prisma.groupInvitation.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => ({
      id: r.id,
      expiresAt: r.expiresAt.toISOString(),
      maxUses: r.maxUses,
      useCount: r.useCount,
      revokedAt: r.revokedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      active:
        !r.revokedAt &&
        r.expiresAt > new Date() &&
        (r.maxUses == null || r.useCount < r.maxUses),
    }));
  }

  async revokeInvitation(
    authSubjectId: string,
    groupId: string,
    invitationId: string,
  ) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    await this.membership.requireMember(groupId, user.id, {
      write: true,
      roles: [MemberRole.OWNER, MemberRole.ADMIN],
    });
    await this.prisma.groupInvitation.updateMany({
      where: { id: invitationId, groupId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  async getInvitationPublic(token: string) {
    const invitation = await this.prisma.groupInvitation.findFirst({
      where: { tokenHash: hashToken(token) },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            iconEmoji: true,
            type: true,
            currencyCode: true,
            status: true,
          },
        },
      },
    });
    if (!invitation) {
      throw ApiError.notFound(
        ErrorCodes.INVITATION_INVALID,
        'Undangan tidak valid.',
      );
    }
    this.assertInvitationUsable(invitation);
    return {
      group: invitation.group,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  async acceptInvitation(authSubjectId: string, token: string) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    const invitation = await this.prisma.groupInvitation.findFirst({
      where: { tokenHash: hashToken(token) },
    });
    if (!invitation) {
      throw ApiError.notFound(
        ErrorCodes.INVITATION_INVALID,
        'Undangan tidak valid.',
      );
    }
    this.assertInvitationUsable(invitation);

    const existing = await this.prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: invitation.groupId,
          userId: user.id,
        },
      },
    });

    if (existing?.status === MemberStatus.ACTIVE) {
      return { groupId: invitation.groupId, alreadyMember: true };
    }

    await this.prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.groupMember.update({
          where: { id: existing.id },
          data: {
            status: MemberStatus.ACTIVE,
            removedAt: null,
            role: MemberRole.MEMBER,
            joinedAt: new Date(),
          },
        });
      } else {
        await tx.groupMember.create({
          data: {
            groupId: invitation.groupId,
            userId: user.id,
            role: MemberRole.MEMBER,
          },
        });
      }
      await tx.groupInvitation.update({
        where: { id: invitation.id },
        data: { useCount: { increment: 1 } },
      });
      await tx.activityEvent.create({
        data: {
          groupId: invitation.groupId,
          actorUserId: user.id,
          eventType: 'member.joined',
          entityType: 'member',
          entityId: user.id,
        },
      });
    });

    return { groupId: invitation.groupId, alreadyMember: false };
  }

  private assertInvitationUsable(invitation: {
    revokedAt: Date | null;
    expiresAt: Date;
    maxUses: number | null;
    useCount: number;
  }) {
    if (invitation.revokedAt) {
      throw new ApiError(
        ErrorCodes.INVITATION_REVOKED,
        'Undangan telah dicabut.',
        400,
      );
    }
    if (invitation.expiresAt <= new Date()) {
      throw new ApiError(
        ErrorCodes.INVITATION_EXPIRED,
        'Undangan kedaluwarsa.',
        400,
      );
    }
    if (
      invitation.maxUses != null &&
      invitation.useCount >= invitation.maxUses
    ) {
      throw new ApiError(
        ErrorCodes.INVITATION_EXPIRED,
        'Kuota undangan habis.',
        400,
      );
    }
  }
}
