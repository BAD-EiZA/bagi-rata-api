import { Module } from '@nestjs/common';
import { ExpensesModule } from '../expenses/expenses.module';
import { CronController } from './cron.controller';

@Module({
  imports: [ExpensesModule],
  controllers: [CronController],
})
export class InternalModule {}
