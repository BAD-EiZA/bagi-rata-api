import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { createHash } from 'crypto';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { requireInternalUser } from '../common/users/resolve-user';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('pwa')
@Controller()
export class PwaController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('pwa/config')
  config() {
    return {
      pwaEnabled: process.env.NEXT_PUBLIC_PWA_ENABLED !== 'false',
      pushEnabled: Boolean(process.env.VAPID_PUBLIC_KEY),
      vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? null,
      offlineDraftRetentionDays: 30,
    };
  }

  @ApiBearerAuth()
  @Post('push-subscriptions')
  async subscribe(
    @CurrentUser() auth: AuthUser,
    @Body()
    body: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
      deviceLabel?: string;
      platform?: string;
    },
  ) {
    const user = await requireInternalUser(this.prisma, auth.authSubjectId);
    const endpointHash = createHash('sha256')
      .update(body.endpoint)
      .digest('hex');

    // ponytail: store encrypted-at-rest later; MVP stores opaque strings server-side only
    const row = await this.prisma.pushSubscription.upsert({
      where: {
        userId_endpointHash: {
          userId: user.id,
          endpointHash,
        },
      },
      create: {
        userId: user.id,
        endpointHash,
        endpointEncrypted: body.endpoint,
        p256dhKeyEncrypted: body.keys.p256dh,
        authKeyEncrypted: body.keys.auth,
        deviceLabel: body.deviceLabel ?? null,
        platform: body.platform ?? null,
      },
      update: {
        endpointEncrypted: body.endpoint,
        p256dhKeyEncrypted: body.keys.p256dh,
        authKeyEncrypted: body.keys.auth,
        revokedAt: null,
        failureCount: 0,
        deviceLabel: body.deviceLabel ?? null,
        platform: body.platform ?? null,
      },
    });

    return {
      id: row.id,
      deviceLabel: row.deviceLabel,
      platform: row.platform,
      createdAt: row.createdAt.toISOString(),
    };
  }

  @ApiBearerAuth()
  @Get('push-subscriptions')
  async list(@CurrentUser() auth: AuthUser) {
    const user = await requireInternalUser(this.prisma, auth.authSubjectId);
    const rows = await this.prisma.pushSubscription.findMany({
      where: { userId: user.id, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      deviceLabel: r.deviceLabel,
      platform: r.platform,
      createdAt: r.createdAt.toISOString(),
      lastSuccessAt: r.lastSuccessAt?.toISOString() ?? null,
    }));
  }

  @ApiBearerAuth()
  @Delete('push-subscriptions/:subscriptionId')
  async revoke(
    @CurrentUser() auth: AuthUser,
    @Param('subscriptionId') subscriptionId: string,
  ) {
    const user = await requireInternalUser(this.prisma, auth.authSubjectId);
    await this.prisma.pushSubscription.updateMany({
      where: { id: subscriptionId, userId: user.id },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  @ApiBearerAuth()
  @Post('offline-drafts/validate')
  async validateDraft(
    @CurrentUser() auth: AuthUser,
    @Body()
    body: {
      groupId: string;
      participantIds?: string[];
    },
  ) {
    const user = await requireInternalUser(this.prisma, auth.authSubjectId);
    const membership = await this.prisma.groupMember.findFirst({
      where: {
        groupId: body.groupId,
        userId: user.id,
        status: 'ACTIVE',
      },
      include: { group: true },
    });
    if (!membership) {
      return { ok: false, reason: 'NOT_MEMBER' };
    }
    if (membership.group.status === 'ARCHIVED') {
      return { ok: false, reason: 'GROUP_ARCHIVED' };
    }
    if (body.participantIds?.length) {
      const count = await this.prisma.groupMember.count({
        where: {
          groupId: body.groupId,
          userId: { in: body.participantIds },
          status: 'ACTIVE',
        },
      });
      if (count !== new Set(body.participantIds).size) {
        return { ok: false, reason: 'PARTICIPANT_INACTIVE' };
      }
    }
    return {
      ok: true,
      currencyCode: membership.group.currencyCode,
      groupStatus: membership.group.status,
    };
  }
}
