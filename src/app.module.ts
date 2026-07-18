import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { BudgetsModule } from './budgets/budgets.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { IdempotencyService } from './common/idempotency/idempotency.service';
import { validateEnv } from './config/env.validation';
import { ExpensesModule } from './expenses/expenses.module';
import { ExportsModule } from './exports/exports.module';
import { GroupsModule } from './groups/groups.module';
import { HealthController } from './health/health.controller';
import { InsightsModule } from './insights/insights.module';
import { InternalModule } from './internal/internal.module';
import { LedgerModule } from './ledger/ledger.module';
import { MediaModule } from './media/media.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { PwaModule } from './pwa/pwa.module';
import { SettlementsModule } from './settlements/settlements.module';
import { SocialModule } from './social/social.module';
import { UsersModule } from './users/users.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    PrismaModule,
    AuthModule,
    UsersModule,
    WebhooksModule,
    LedgerModule,
    GroupsModule,
    ExpensesModule,
    MediaModule,
    BillingModule,
    AiModule,
    NotificationsModule,
    SettlementsModule,
    SocialModule,
    InsightsModule,
    ExportsModule,
    BudgetsModule,
    PwaModule,
    InternalModule,
  ],
  controllers: [HealthController],
  providers: [
    IdempotencyService,
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  exports: [IdempotencyService],
})
export class AppModule {}
