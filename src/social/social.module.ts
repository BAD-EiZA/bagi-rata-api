import { Module } from '@nestjs/common';
import { GroupsModule } from '../groups/groups.module';
import { LedgerModule } from '../ledger/ledger.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';

@Module({
  imports: [GroupsModule, LedgerModule, NotificationsModule],
  controllers: [SocialController],
  providers: [SocialService],
  exports: [SocialService],
})
export class SocialModule {}
