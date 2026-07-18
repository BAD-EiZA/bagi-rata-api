import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private webpush: typeof import('web-push') | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private async ensureWebPush() {
    if (this.webpush) return this.webpush;
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject =
      this.config.get<string>('VAPID_SUBJECT') ?? 'mailto:support@bagirata.id';
    if (!publicKey || !privateKey) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const webpush = require('web-push') as typeof import('web-push');
    webpush.setVapidDetails(subject, publicKey, privateKey);
    this.webpush = webpush;
    return webpush;
  }

  async sendToUser(
    userId: string,
    payload: { title: string; body: string; url?: string },
  ) {
    const webpush = await this.ensureWebPush();
    if (!webpush) return { sent: 0 };

    const subs = await this.prisma.pushSubscription.findMany({
      where: { userId, revokedAt: null },
    });
    let sent = 0;
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpointEncrypted,
            keys: {
              p256dh: sub.p256dhKeyEncrypted,
              auth: sub.authKeyEncrypted,
            },
          },
          JSON.stringify(payload),
        );
        await this.prisma.pushSubscription.update({
          where: { id: sub.id },
          data: { lastSuccessAt: new Date(), failureCount: 0 },
        });
        sent += 1;
      } catch (err) {
        const statusCode =
          err && typeof err === 'object' && 'statusCode' in err
            ? Number((err as { statusCode?: number }).statusCode)
            : 0;
        this.logger.warn(`Push failed ${sub.id}: ${statusCode}`);
        if (statusCode === 404 || statusCode === 410) {
          await this.prisma.pushSubscription.update({
            where: { id: sub.id },
            data: { revokedAt: new Date() },
          });
        } else {
          await this.prisma.pushSubscription.update({
            where: { id: sub.id },
            data: { failureCount: { increment: 1 } },
          });
        }
      }
    }
    return { sent };
  }
}
