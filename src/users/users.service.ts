import { Injectable, Logger } from '@nestjs/common';
import { createClerkClient } from '@clerk/backend';
import { ConfigService } from '@nestjs/config';
import { User, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError } from '../common/errors/api-error';
import { ErrorCodes } from '../common/errors/error-codes';
import { UpdateMeDto } from './dto/update-me.dto';

export type UserResponse = {
  id: string;
  clerkUserId: string;
  displayName: string;
  primaryEmail: string | null;
  avatarUrl: string | null;
  locale: string;
  timezone: string;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly clerk;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const secretKey = this.config.get<string>('CLERK_SECRET_KEY');
    this.clerk = secretKey ? createClerkClient({ secretKey }) : null;
  }

  toResponse(user: User): UserResponse {
    return {
      id: user.id,
      clerkUserId: user.clerkUserId,
      displayName: user.displayName,
      primaryEmail: user.primaryEmail,
      avatarUrl: user.avatarUrl,
      locale: user.locale,
      timezone: user.timezone,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  async findByClerkId(clerkUserId: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { clerkUserId } });
  }

  async getMe(clerkUserId: string): Promise<UserResponse> {
    const user = await this.findByClerkId(clerkUserId);
    if (!user || user.status === UserStatus.DELETED) {
      throw ApiError.notFound(
        ErrorCodes.USER_NOT_FOUND,
        'Profil pengguna tidak ditemukan. Panggil bootstrap terlebih dahulu.',
      );
    }
    return this.toResponse(user);
  }

  async bootstrap(clerkUserId: string): Promise<UserResponse> {
    const existing = await this.findByClerkId(clerkUserId);
    if (existing && existing.status !== UserStatus.DELETED) {
      return this.toResponse(existing);
    }

    const profile = await this.fetchClerkProfile(clerkUserId);
    const user = await this.prisma.user.upsert({
      where: { clerkUserId },
      create: {
        clerkUserId,
        displayName: profile.displayName,
        primaryEmail: profile.primaryEmail,
        avatarUrl: profile.avatarUrl,
        status: UserStatus.ACTIVE,
      },
      update: {
        displayName: profile.displayName,
        primaryEmail: profile.primaryEmail,
        avatarUrl: profile.avatarUrl,
        status: UserStatus.ACTIVE,
      },
    });

    return this.toResponse(user);
  }

  async updateMe(
    clerkUserId: string,
    dto: UpdateMeDto,
  ): Promise<UserResponse> {
    const existing = await this.findByClerkId(clerkUserId);
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
      },
    });

    return this.toResponse(user);
  }

  async upsertFromClerkEvent(input: {
    clerkUserId: string;
    displayName: string;
    primaryEmail: string | null;
    avatarUrl: string | null;
    deleted?: boolean;
  }): Promise<void> {
    if (input.deleted) {
      await this.prisma.user.upsert({
        where: { clerkUserId: input.clerkUserId },
        create: {
          clerkUserId: input.clerkUserId,
          displayName: input.displayName || 'Pengguna',
          primaryEmail: input.primaryEmail,
          avatarUrl: input.avatarUrl,
          status: UserStatus.DELETED,
        },
        update: {
          status: UserStatus.DELETED,
          displayName: input.displayName || undefined,
          primaryEmail: input.primaryEmail,
          avatarUrl: input.avatarUrl,
        },
      });
      return;
    }

    await this.prisma.user.upsert({
      where: { clerkUserId: input.clerkUserId },
      create: {
        clerkUserId: input.clerkUserId,
        displayName: input.displayName || 'Pengguna',
        primaryEmail: input.primaryEmail,
        avatarUrl: input.avatarUrl,
        status: UserStatus.ACTIVE,
      },
      update: {
        displayName: input.displayName || undefined,
        primaryEmail: input.primaryEmail,
        avatarUrl: input.avatarUrl,
        status: UserStatus.ACTIVE,
      },
    });
  }

  private async fetchClerkProfile(clerkUserId: string): Promise<{
    displayName: string;
    primaryEmail: string | null;
    avatarUrl: string | null;
  }> {
    if (!this.clerk) {
      return {
        displayName: 'Pengguna',
        primaryEmail: null,
        avatarUrl: null,
      };
    }

    try {
      const clerkUser = await this.clerk.users.getUser(clerkUserId);
      const primaryEmail =
        clerkUser.emailAddresses.find(
          (item) => item.id === clerkUser.primaryEmailAddressId,
        )?.emailAddress ??
        clerkUser.emailAddresses[0]?.emailAddress ??
        null;

      const displayName =
        [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') ||
        clerkUser.username ||
        primaryEmail ||
        'Pengguna';

      return {
        displayName,
        primaryEmail,
        avatarUrl: clerkUser.imageUrl ?? null,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to fetch Clerk user ${clerkUserId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        displayName: 'Pengguna',
        primaryEmail: null,
        avatarUrl: null,
      };
    }
  }
}
