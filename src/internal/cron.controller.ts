import { Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import {
  AttachmentStatus,
  BillingOrderStatus,
  SubscriptionStatus,
} from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

@ApiExcludeController()
@Controller('internal/cron')
export class CronController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private assertSecret(secret?: string) {
    const expected = this.config.get<string>('CRON_SECRET');
    if (!expected || secret !== expected) {
      throw new UnauthorizedException('Invalid cron secret');
    }
  }

  @Public()
  @Post('cleanup-uploads')
  async cleanupUploads(@Headers('x-cron-secret') secret?: string) {
    this.assertSecret(secret);
    const expired = await this.prisma.uploadSession.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    const drafts = await this.prisma.mediaAttachment.updateMany({
      where: {
        entityType: 'DRAFT',
        entityId: null,
        createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        deletedAt: null,
      },
      data: { deletedAt: new Date(), status: AttachmentStatus.DELETED },
    });
    return { expiredSessions: expired.count, expiredDrafts: drafts.count };
  }

  @Public()
  @Post('expire-resources')
  async expireResources(@Headers('x-cron-secret') secret?: string) {
    this.assertSecret(secret);
    const now = new Date();
    const invitations = await this.prisma.groupInvitation.updateMany({
      where: { expiresAt: { lt: now }, revokedAt: null },
      data: { revokedAt: now },
    });
    const orders = await this.prisma.billingOrder.updateMany({
      where: {
        status: BillingOrderStatus.PENDING,
        expiresAt: { lt: now },
      },
      data: { status: BillingOrderStatus.EXPIRED },
    });
    return { expiredInvitations: invitations.count, expiredOrders: orders.count };
  }

  @Public()
  @Post('expire-subscriptions')
  async expireSubscriptions(@Headers('x-cron-secret') secret?: string) {
    this.assertSecret(secret);
    const now = new Date();
    const expired = await this.prisma.subscription.updateMany({
      where: {
        status: {
          in: [
            SubscriptionStatus.ACTIVE,
            SubscriptionStatus.CANCELED,
            SubscriptionStatus.GRACE_PERIOD,
            SubscriptionStatus.PAST_DUE,
          ],
        },
        currentPeriodEnd: { lt: now },
        OR: [{ graceEndsAt: null }, { graceEndsAt: { lt: now } }],
      },
      data: {
        status: SubscriptionStatus.EXPIRED,
        expiredAt: now,
      },
    });
    return { expiredSubscriptions: expired.count };
  }

  @Public()
  @Post('reconcile-billing')
  async reconcileBilling(@Headers('x-cron-secret') secret?: string) {
    this.assertSecret(secret);
    // MVP: mark stale pending orders; full Midtrans Get Status later
    const stale = await this.prisma.billingOrder.updateMany({
      where: {
        status: BillingOrderStatus.PENDING,
        createdAt: { lt: new Date(Date.now() - 48 * 60 * 60 * 1000) },
      },
      data: { status: BillingOrderStatus.EXPIRED },
    });
    return { staleOrdersExpired: stale.count };
  }
}
