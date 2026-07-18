import { Module } from '@nestjs/common';
import { GroupsModule } from '../groups/groups.module';
import { LedgerModule } from '../ledger/ledger.module';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';

@Module({
  imports: [GroupsModule, LedgerModule],
  controllers: [InsightsController],
  providers: [InsightsService],
  exports: [InsightsService],
})
export class InsightsModule {}
