import { Module, forwardRef } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { MembershipService } from './membership.service';

@Module({
  imports: [forwardRef(() => LedgerModule)],
  controllers: [GroupsController],
  providers: [GroupsService, MembershipService],
  exports: [GroupsService, MembershipService],
})
export class GroupsModule {}
