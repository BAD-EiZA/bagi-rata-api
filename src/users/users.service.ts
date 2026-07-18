import { Injectable } from '@nestjs/common';
import { User, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError } from '../common/errors/api-error';
import { ErrorCodes } from '../common/errors/error-codes';
import { UpdateMeDto } from './dto/update-me.dto';
import type { AuthUser } from '../auth/auth.types';

export type UserResponse = {
  id: string;
  authSubjectId: string;
  displayName: string;
  primaryEmail: string | null;
  avatarUrl: string | null;
  locale: string;
  timezone: string;
  status: UserStatus;
  notifyMentions: boolean;
  notifySettlements: boolean;
  notifyReminders: boolean;
  notifyEmail: boolean;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  toResponse(user: User): UserResponse {
    return {
      id: user.id,
      authSubjectId: user.authSubjectId,
      displayName: user.displayName,
      primaryEmail: user.primaryEmail,
      avatarUrl: user.avatarUrl,
      locale: user.locale,
      timezone: user.timezone,
      status: user.status,
      notifyMentions: user.notifyMentions,
      notifySettlements: user.notifySettlements,
      notifyReminders: user.notifyReminders,
      notifyEmail: user.notifyEmail,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  async findByAuthSubjectId(authSubjectId: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { authSubjectId } });
  }

  async getMe(authSubjectId: string): Promise<UserResponse> {
    const user = await this.findByAuthSubjectId(authSubjectId);
    if (!user || user.status === UserStatus.DELETED) {
      throw ApiError.notFound(
        ErrorCodes.USER_NOT_FOUND,
        'Profil pengguna tidak ditemukan. Panggil bootstrap terlebih dahulu.',
      );
    }
    return this.toResponse(user);
  }

  async bootstrap(auth: AuthUser): Promise<UserResponse> {
    const authSubjectId = auth.authSubjectId;
    const existing = await this.findByAuthSubjectId(authSubjectId);
    if (existing && existing.status !== UserStatus.DELETED) {
      if (auth.email || auth.name || auth.picture) {
        const updated = await this.prisma.user.update({
          where: { id: existing.id },
          data: {
            ...(auth.name ? { displayName: auth.name } : {}),
            ...(auth.email !== undefined
              ? { primaryEmail: auth.email ?? null }
              : {}),
            ...(auth.picture !== undefined
              ? { avatarUrl: auth.picture ?? null }
              : {}),
            status: UserStatus.ACTIVE,
          },
        });
        return this.toResponse(updated);
      }
      return this.toResponse(existing);
    }

    const displayName =
      auth.name?.trim() || auth.email?.split('@')[0] || 'Pengguna';

    const user = await this.prisma.user.upsert({
      where: { authSubjectId },
      create: {
        authSubjectId,
        displayName,
        primaryEmail: auth.email ?? null,
        avatarUrl: auth.picture ?? null,
        status: UserStatus.ACTIVE,
      },
      update: {
        displayName,
        primaryEmail: auth.email ?? null,
        avatarUrl: auth.picture ?? null,
        status: UserStatus.ACTIVE,
      },
    });

    return this.toResponse(user);
  }

  async updateMe(
    authSubjectId: string,
    dto: UpdateMeDto,
  ): Promise<UserResponse> {
    const existing = await this.findByAuthSubjectId(authSubjectId);
    if (!existing || existing.status === UserStatus.DELETED) {
      throw ApiError.notFound(
        ErrorCodes.USER_NOT_FOUND,
        'Profil pengguna tidak ditemukan.',
      );
    }

    const user = await this.prisma.user.update({
      where: { id: existing.id },
      data: {
        ...(dto.displayName !== undefined
          ? { displayName: dto.displayName.trim() }
          : {}),
        ...(dto.locale !== undefined ? { locale: dto.locale } : {}),
        ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
        ...(dto.notifyMentions !== undefined
          ? { notifyMentions: dto.notifyMentions }
          : {}),
        ...(dto.notifySettlements !== undefined
          ? { notifySettlements: dto.notifySettlements }
          : {}),
        ...(dto.notifyReminders !== undefined
          ? { notifyReminders: dto.notifyReminders }
          : {}),
        ...(dto.notifyEmail !== undefined
          ? { notifyEmail: dto.notifyEmail }
          : {}),
      },
    });

    return this.toResponse(user);
  }
}
