import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { KindeAuthGuard } from './kinde-auth.guard';

@Global()
@Module({
  providers: [
    KindeAuthGuard,
    {
      provide: APP_GUARD,
      useClass: KindeAuthGuard,
    },
  ],
  exports: [KindeAuthGuard],
})
export class AuthModule {}
