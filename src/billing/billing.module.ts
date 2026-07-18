import { Module } from '@nestjs/common';
import { GroupsModule } from '../groups/groups.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { EntitlementService } from './entitlement.service';
import { UsageService } from './usage.service';

@Module({
  imports: [GroupsModule],
  controllers: [BillingController],
  providers: [BillingService, EntitlementService, UsageService],
  exports: [BillingService, EntitlementService, UsageService],
})
export class BillingModule {}
