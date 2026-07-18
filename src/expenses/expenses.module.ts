import { Module } from '@nestjs/common';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { GroupsModule } from '../groups/groups.module';
import { LedgerModule } from '../ledger/ledger.module';
import { ExpenseSplitService } from './expense-split.service';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';

@Module({
  imports: [GroupsModule, LedgerModule],
  controllers: [ExpensesController],
  providers: [ExpensesService, ExpenseSplitService, IdempotencyService],
  exports: [ExpensesService, ExpenseSplitService],
})
export class ExpensesModule {}
