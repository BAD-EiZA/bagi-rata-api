import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { GroupsModule } from '../groups/groups.module';
import { AiController } from './ai.controller';
import { ReceiptScanService } from './receipt-scan.service';

@Module({
  imports: [GroupsModule, BillingModule],
  controllers: [AiController],
  providers: [ReceiptScanService],
  exports: [ReceiptScanService],
})
export class AiModule {}
