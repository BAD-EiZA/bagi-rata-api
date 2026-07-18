import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  // Lazy connect: avoid hanging serverless cold-start if DB is slow
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
