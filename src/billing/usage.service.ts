import { Injectable } from '@nestjs/common';
import { SubjectType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError } from '../common/errors/api-error';
import { ErrorCodes } from '../common/errors/error-codes';

@Injectable()
export class UsageService {
  constructor(private readonly prisma: PrismaService) {}

  private calendarMonthBoundsJakarta(now = new Date()) {
    const jkt = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const startUtc = Date.UTC(jkt.getUTCFullYear(), jkt.getUTCMonth(), 1);
    const endUtc = Date.UTC(jkt.getUTCFullYear(), jkt.getUTCMonth() + 1, 1);
    return {
      start: new Date(startUtc - 7 * 60 * 60 * 1000),
      end: new Date(endUtc - 7 * 60 * 60 * 1000),
    };
  }

  async getOrCreateCounter(input: {
    subjectType: SubjectType;
    subjectId: string;
    metricKey: string;
    limit: number;
    periodStart?: Date;
    periodEnd?: Date;
  }) {
    const bounds = this.calendarMonthBoundsJakarta();
    const periodStart = input.periodStart ?? bounds.start;
    const periodEnd = input.periodEnd ?? bounds.end;

    return this.prisma.usageCounter.upsert({
      where: {
        subjectType_subjectId_metricKey_periodStart: {
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          metricKey: input.metricKey,
          periodStart,
        },
      },
      create: {
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        metricKey: input.metricKey,
        periodStart,
        periodEnd,
        usedCount: 0,
        reservedCount: 0,
        limitSnapshot: input.limit,
      },
      update: {
        limitSnapshot: input.limit,
        periodEnd,
      },
    });
  }

  async assertAndIncrement(input: {
    subjectType: SubjectType;
    subjectId: string;
    metricKey: string;
    limit: number;
  }) {
    const counter = await this.getOrCreateCounter(input);
    if (counter.usedCount + counter.reservedCount >= counter.limitSnapshot) {
      throw new ApiError(
        ErrorCodes.USAGE_QUOTA_EXCEEDED,
        'Kuota fitur premium habis untuk periode ini.',
        402,
        {
          used: counter.usedCount,
          limit: counter.limitSnapshot,
          resetAt: counter.periodEnd.toISOString(),
        },
      );
    }
    return this.prisma.usageCounter.update({
      where: { id: counter.id },
      data: { usedCount: { increment: 1 }, version: { increment: 1 } },
    });
  }

  async getUsage(input: {
    subjectType: SubjectType;
    subjectId: string;
    metricKey: string;
    limit: number;
  }) {
    const counter = await this.getOrCreateCounter(input);
    return {
      metricKey: input.metricKey,
      used: counter.usedCount,
      limit: counter.limitSnapshot,
      remaining: Math.max(counter.limitSnapshot - counter.usedCount, 0),
      periodStart: counter.periodStart.toISOString(),
      periodEnd: counter.periodEnd.toISOString(),
    };
  }
}
