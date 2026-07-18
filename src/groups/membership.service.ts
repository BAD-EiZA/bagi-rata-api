import { Injectable } from '@nestjs/common';
import { GroupStatus, MemberRole, MemberStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError } from '../common/errors/api-error';
import { ErrorCodes } from '../common/errors/error-codes';

export type MembershipContext = {
  groupId: string;
  userId: string;
  role: MemberRole;
  groupStatus: GroupStatus;
  currencyCode: string;
};

@Injectable()
export class MembershipService {
  constructor(private readonly prisma: PrismaService) {}

  async requireMember(
    groupId: string,
    userId: string,
    options?: { write?: boolean; roles?: MemberRole[] },
  ): Promise<MembershipContext> {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          where: { userId, status: MemberStatus.ACTIVE },
          take: 1,
        },
      },
    });

    if (!group) {
      throw ApiError.notFound(ErrorCodes.GROUP_NOT_FOUND, 'Grup tidak ditemukan.');
    }

    const member = group.members[0];
    if (!member) {
      throw ApiError.forbidden('Anda bukan anggota grup ini.');
    }

    if (options?.write && group.status === GroupStatus.ARCHIVED) {
      throw new ApiError(
        ErrorCodes.GROUP_ARCHIVED,
        'Grup diarsipkan dan bersifat read-only.',
        403,
      );
    }

    if (options?.roles && !options.roles.includes(member.role)) {
      throw ApiError.forbidden('Izin tidak cukup untuk aksi ini.');
    }

    return {
      groupId: group.id,
      userId,
      role: member.role,
      groupStatus: group.status,
      currencyCode: group.currencyCode,
    };
  }

  async requireActiveMemberIds(
    groupId: string,
    userIds: string[],
  ): Promise<void> {
    const unique = [...new Set(userIds)];
    const count = await this.prisma.groupMember.count({
      where: {
        groupId,
        userId: { in: unique },
        status: MemberStatus.ACTIVE,
      },
    });
    if (count !== unique.length) {
      throw new ApiError(
        ErrorCodes.MEMBER_NOT_FOUND,
        'Pembayar atau peserta harus anggota aktif grup.',
        400,
      );
    }
  }
}
