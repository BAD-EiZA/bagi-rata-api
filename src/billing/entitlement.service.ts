import { Injectable } from '@nestjs/common';
import { SubjectType, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type EntitlementSnapshot = {
  planCode: string;
  aiScanLimit: number;
  attachmentLimit: number;
  personalInsightAdvanced: boolean;
  groupInsightAdvanced: boolean;
  exportEnabled: boolean;
  source: 'FREE' | 'PLUS' | 'GROUP_PRO' | 'TRIP_PASS';
};

const FREE: EntitlementSnapshot = {
  planCode: 'FREE',
  aiScanLimit: 5,
  attachmentLimit: 3,
  personalInsightAdvanced: false,
  groupInsightAdvanced: false,
  exportEnabled: false,
  source: 'FREE',
};

@Injectable()
export class EntitlementService {
  constructor(private readonly prisma: PrismaService) {}

  private activeStatuses: SubscriptionStatus[] = [
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.GRACE_PERIOD,
    SubscriptionStatus.CANCELED,
  ];

  async resolveForUser(userId: string): Promise<EntitlementSnapshot> {
    const now = new Date();
    const sub = await this.prisma.subscription.findFirst({
      where: {
        subjectType: SubjectType.USER,
        subjectUserId: userId,
        status: { in: this.activeStatuses },
        OR: [
          { currentPeriodEnd: null },
          { currentPeriodEnd: { gt: now } },
        ],
      },
      include: { plan: true, entitlements: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!sub) return FREE;
    return this.fromSubscription(sub);
  }

  async resolveForGroup(
    groupId: string,
    userId: string,
  ): Promise<EntitlementSnapshot> {
    const now = new Date();
    const groupSub = await this.prisma.subscription.findFirst({
      where: {
        subjectType: SubjectType.GROUP,
        subjectGroupId: groupId,
        status: { in: this.activeStatuses },
        OR: [
          { currentPeriodEnd: null },
          { currentPeriodEnd: { gt: now } },
        ],
      },
      include: { plan: true, entitlements: true },
      orderBy: { createdAt: 'desc' },
    });
    const userEnt = await this.resolveForUser(userId);
    if (!groupSub) return userEnt;
    const groupEnt = this.fromSubscription(groupSub);
    return this.merge(userEnt, groupEnt);
  }

  private fromSubscription(sub: {
    plan: { code: string; entitlementConfig: unknown };
    entitlements: Array<{
      featureKey: string;
      integerValue: number | null;
      booleanValue: boolean | null;
    }>;
    currentPeriodEnd: Date | null;
  }): EntitlementSnapshot {
    const cfg = (sub.plan.entitlementConfig ?? {}) as Record<string, unknown>;
    const getInt = (key: string, fallback: number) => {
      const ent = sub.entitlements.find((e) => e.featureKey === key);
      if (ent?.integerValue != null) return ent.integerValue;
      return typeof cfg[key] === 'number' ? (cfg[key] as number) : fallback;
    };
    const getBool = (key: string, fallback: boolean) => {
      const ent = sub.entitlements.find((e) => e.featureKey === key);
      if (ent?.booleanValue != null) return ent.booleanValue;
      return typeof cfg[key] === 'boolean' ? (cfg[key] as boolean) : fallback;
    };

    const code = sub.plan.code;
    let source: EntitlementSnapshot['source'] = 'PLUS';
    if (code.startsWith('GROUP_PRO')) source = 'GROUP_PRO';
    if (code.startsWith('TRIP_PASS')) source = 'TRIP_PASS';

    return {
      planCode: code,
      aiScanLimit: getInt('aiScanLimit', FREE.aiScanLimit),
      attachmentLimit: getInt('attachmentLimit', FREE.attachmentLimit),
      personalInsightAdvanced: getBool(
        'personalInsightAdvanced',
        FREE.personalInsightAdvanced,
      ),
      groupInsightAdvanced: getBool(
        'groupInsightAdvanced',
        FREE.groupInsightAdvanced,
      ),
      exportEnabled: getBool('exportEnabled', FREE.exportEnabled),
      source,
    };
  }

  private merge(
    a: EntitlementSnapshot,
    b: EntitlementSnapshot,
  ): EntitlementSnapshot {
    return {
      planCode: b.source !== 'FREE' ? b.planCode : a.planCode,
      aiScanLimit: Math.max(a.aiScanLimit, b.aiScanLimit),
      attachmentLimit: Math.max(a.attachmentLimit, b.attachmentLimit),
      personalInsightAdvanced:
        a.personalInsightAdvanced || b.personalInsightAdvanced,
      groupInsightAdvanced: a.groupInsightAdvanced || b.groupInsightAdvanced,
      exportEnabled: a.exportEnabled || b.exportEnabled,
      source: b.source !== 'FREE' ? b.source : a.source,
    };
  }
}
