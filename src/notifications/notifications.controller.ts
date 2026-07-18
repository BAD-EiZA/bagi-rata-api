import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { requireInternalUser } from '../common/users/resolve-user';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller()
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('notifications')
  async list(@CurrentUser() auth: AuthUser) {
    const user = await requireInternalUser(this.prisma, auth.clerkUserId);
    const [items, unreadCount] = await Promise.all([
      this.notifications.list(user.id),
      this.notifications.unreadCount(user.id),
    ]);
    return { items, unreadCount };
  }

  @Post('notifications/:notificationId/read')
  async read(
    @CurrentUser() auth: AuthUser,
    @Param('notificationId') notificationId: string,
  ) {
    const user = await requireInternalUser(this.prisma, auth.clerkUserId);
    return this.notifications.markRead(user.id, notificationId);
  }

  @Post('notifications/read-all')
  async readAll(@CurrentUser() auth: AuthUser) {
    const user = await requireInternalUser(this.prisma, auth.clerkUserId);
    return this.notifications.markAllRead(user.id);
  }
}
