import { createHash, randomBytes } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BillingOrderStatus,
  BillingOrderType,
  BillingType,
  MemberRole,
  PlanScope,
  Prisma,
  SubjectType,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError } from '../common/errors/api-error';
import { ErrorCodes } from '../common/errors/error-codes';
import { requireInternalUser } from '../common/users/resolve-user';
import { MembershipService } from '../groups/membership.service';
import { EntitlementService } from './entitlement.service';
import { UsageService } from './usage.service';
import { isPaidStatus, verifyMidtransSignature } from './midtrans.util';

const DEFAULT_PLANS: Array<{
  code: string;
  name: string;
  scopeType: PlanScope;
  billingType: BillingType;
  amountMinor: number;
  durationUnit: string | null;
  durationValue: number | null;
  entitlementConfig: Record<string, unknown>;
  sortOrder: number;
}> = [
  {
    code: 'FREE',
    name: 'Free',
    scopeType: PlanScope.USER,
    billingType: BillingType.FREE,
    amountMinor: 0,
    durationUnit: null,
    durationValue: null,
    entitlementConfig: {
      aiScanLimit: 5,
      attachmentLimit: 3,
      personalInsightAdvanced: false,
      groupInsightAdvanced: false,
      exportEnabled: false,
    },
    sortOrder: 0,
  },
  {
    code: 'PLUS_MONTHLY',
    name: 'Bagi Rata Plus (Bulanan)',
    scopeType: PlanScope.USER,
    billingType: BillingType.RECURRING,
    amountMinor: 24900,
    durationUnit: 'month',
    durationValue: 1,
    entitlementConfig: {
      aiScanLimit: 150,
      attachmentLimit: 10,
      personalInsightAdvanced: true,
      groupInsightAdvanced: false,
      exportEnabled: true,
    },
    sortOrder: 1,
  },
  {
    code: 'PLUS_ANNUAL',
    name: 'Bagi Rata Plus (Tahunan)',
    scopeType: PlanScope.USER,
    billingType: BillingType.RECURRING,
    amountMinor: 249000,
    durationUnit: 'year',
    durationValue: 1,
    entitlementConfig: {
      aiScanLimit: 150,
      attachmentLimit: 10,
      personalInsightAdvanced: true,
      groupInsightAdvanced: false,
      exportEnabled: true,
    },
    sortOrder: 2,
  },
  {
    code: 'GROUP_PRO_MONTHLY',
    name: 'Group Pro (Bulanan)',
    scopeType: PlanScope.GROUP,
    billingType: BillingType.RECURRING,
    amountMinor: 69000,
    durationUnit: 'month',
    durationValue: 1,
    entitlementConfig: {
      aiScanLimit: 500,
      attachmentLimit: 10,
      personalInsightAdvanced: false,
      groupInsightAdvanced: true,
      exportEnabled: true,
    },
    sortOrder: 3,
  },
  {
    code: 'GROUP_PRO_ANNUAL',
    name: 'Group Pro (Tahunan)',
    scopeType: PlanScope.GROUP,
    billingType: BillingType.RECURRING,
    amountMinor: 690000,
    durationUnit: 'year',
    durationValue: 1,
    entitlementConfig: {
      aiScanLimit: 500,
      attachmentLimit: 10,
      personalInsightAdvanced: false,
      groupInsightAdvanced: true,
      exportEnabled: true,
    },
    sortOrder: 4,
  },
  {
    code: 'TRIP_PASS_45D',
    name: 'Trip Pass (45 hari)',
    scopeType: PlanScope.GROUP,
    billingType: BillingType.ONE_TIME,
    amountMinor: 49000,
    durationUnit: 'day',
    durationValue: 45,
    entitlementConfig: {
      aiScanLimit: 150,
      attachmentLimit: 10,
      personalInsightAdvanced: false,
      groupInsightAdvanced: true,
      exportEnabled: true,
    },
    sortOrder: 5,
  },
];

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly membership: MembershipService,
    private readonly entitlements: EntitlementService,
    private readonly usage: UsageService,
  ) {}

  async ensurePlansSeeded() {
    for (const plan of DEFAULT_PLANS) {
      await this.prisma.subscriptionPlan.upsert({
        where: { code: plan.code },
        create: {
          code: plan.code,
          name: plan.name,
          scopeType: plan.scopeType,
          billingType: plan.billingType,
          amountMinor: plan.amountMinor,
          durationUnit: plan.durationUnit,
          durationValue: plan.durationValue,
          entitlementConfig: plan.entitlementConfig as Prisma.InputJsonValue,
          sortOrder: plan.sortOrder,
        },
        update: {
          name: plan.name,
          amountMinor: plan.amountMinor,
          entitlementConfig: plan.entitlementConfig as Prisma.InputJsonValue,
          isActive: true,
          sortOrder: plan.sortOrder,
        },
      });
    }
  }

  async listPlans() {
    await this.ensurePlansSeeded();
    const plans = await this.prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    return plans.map((p) => ({
      code: p.code,
      name: p.name,
      scopeType: p.scopeType,
      billingType: p.billingType,
      amountMinor: p.amountMinor,
      currencyCode: p.currencyCode,
      durationUnit: p.durationUnit,
      durationValue: p.durationValue,
      entitlementConfig: p.entitlementConfig,
    }));
  }

  async getEntitlements(authSubjectId: string, groupId?: string) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    const ent = groupId
      ? await this.entitlements.resolveForGroup(groupId, user.id)
      : await this.entitlements.resolveForUser(user.id);
    const usage = await this.usage.getUsage({
      subjectType: groupId ? SubjectType.GROUP : SubjectType.USER,
      subjectId: groupId ?? user.id,
      metricKey: 'AI_RECEIPT_SCAN',
      limit: ent.aiScanLimit,
    });
    return { entitlement: ent, usage };
  }

  async listSubscriptions(authSubjectId: string) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    const rows = await this.prisma.subscription.findMany({
      where: {
        OR: [{ payerUserId: user.id }, { subjectUserId: user.id }],
      },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((s) => this.mapSubscription(s));
  }

  async checkout(
    authSubjectId: string,
    input: {
      planCode: string;
      groupId?: string;
      autoRenew?: boolean;
      promoCode?: string;
    },
  ) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    await this.ensurePlansSeeded();
    const plan = await this.prisma.subscriptionPlan.findFirst({
      where: { code: input.planCode, isActive: true },
    });
    if (!plan || plan.billingType === BillingType.FREE) {
      throw new ApiError(
        ErrorCodes.PLAN_NOT_AVAILABLE,
        'Paket tidak tersedia.',
        400,
      );
    }

    if (plan.scopeType === PlanScope.GROUP) {
      if (!input.groupId) {
        throw new ApiError(
          ErrorCodes.SUBSCRIPTION_SCOPE_INVALID,
          'groupId wajib untuk paket grup.',
          400,
        );
      }
      await this.membership.requireMember(input.groupId, user.id, {
        write: true,
        roles: [MemberRole.OWNER],
      });
    }

    let amountMinor = plan.amountMinor;
    let promoId: string | null = null;
    let trialDays = 0;
    if (input.promoCode?.trim()) {
      const promo = await this.prisma.promoCode.findFirst({
        where: {
          code: input.promoCode.trim().toUpperCase(),
          active: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      });
      if (!promo || promo.planCode !== plan.code) {
        throw new ApiError(
          ErrorCodes.VALIDATION_FAILED,
          'Kode promo tidak valid untuk paket ini.',
          400,
        );
      }
      if (
        promo.maxRedemptions != null &&
        promo.redemptionCount >= promo.maxRedemptions
      ) {
        throw new ApiError(
          ErrorCodes.VALIDATION_FAILED,
          'Kuota promo habis.',
          400,
        );
      }
      const already = await this.prisma.promoRedemption.findFirst({
        where: { promoCodeId: promo.id, userId: user.id },
      });
      if (already) {
        throw new ApiError(
          ErrorCodes.VALIDATION_FAILED,
          'Promo sudah pernah dipakai.',
          400,
        );
      }
      promoId = promo.id;
      trialDays = promo.trialDays;
      amountMinor = Math.max(
        0,
        Math.floor((plan.amountMinor * (100 - promo.percentOff)) / 100),
      );
    }

    if (amountMinor <= 0 && trialDays > 0) {
      // 100% promo / trial: grant entitlement without Midtrans
      const periodEnd = new Date(
        Date.now() + trialDays * 24 * 60 * 60 * 1000,
      );
      const sub = await this.prisma.subscription.create({
        data: {
          planId: plan.id,
          payerUserId: user.id,
          subjectType:
            plan.scopeType === PlanScope.GROUP
              ? SubjectType.GROUP
              : SubjectType.USER,
          subjectUserId:
            plan.scopeType === PlanScope.USER ? user.id : null,
          subjectGroupId:
            plan.scopeType === PlanScope.GROUP ? input.groupId! : null,
          status: SubscriptionStatus.ACTIVE,
          autoRenew: false,
          currentPeriodStart: new Date(),
          currentPeriodEnd: periodEnd,
        },
      });
      if (promoId) {
        await this.prisma.promoRedemption.create({
          data: { promoCodeId: promoId, userId: user.id },
        });
        await this.prisma.promoCode.update({
          where: { id: promoId },
          data: { redemptionCount: { increment: 1 } },
        });
      }
      return {
        orderId: `promo_${sub.id}`,
        amountMinor: 0,
        currencyCode: plan.currencyCode,
        planCode: plan.code,
        snapToken: '',
        snapRedirectUrl: '',
        clientKey: null,
        isProduction: false,
        autoRenewRequested: false,
        promoApplied: true,
        trialEndsAt: periodEnd.toISOString(),
      };
    }

    if (amountMinor <= 0) {
      throw new ApiError(
        ErrorCodes.PLAN_NOT_AVAILABLE,
        'Paket gratis tidak membutuhkan checkout.',
        400,
      );
    }

    const orderId = `br_${Date.now()}_${randomBytes(4).toString('hex')}`;
    const order = await this.prisma.billingOrder.create({
      data: {
        orderId,
        planId: plan.id,
        payerUserId: user.id,
        subjectType:
          plan.scopeType === PlanScope.GROUP
            ? SubjectType.GROUP
            : SubjectType.USER,
        subjectUserId:
          plan.scopeType === PlanScope.USER ? user.id : null,
        subjectGroupId:
          plan.scopeType === PlanScope.GROUP ? input.groupId! : null,
        orderType:
          plan.billingType === BillingType.ONE_TIME
            ? BillingOrderType.PASS_PURCHASE
            : BillingOrderType.INITIAL,
        amountMinor,
        currencyCode: plan.currencyCode,
        status: BillingOrderStatus.PENDING,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    if (promoId) {
      await this.prisma.promoRedemption.create({
        data: { promoCodeId: promoId, userId: user.id },
      });
      await this.prisma.promoCode.update({
        where: { id: promoId },
        data: { redemptionCount: { increment: 1 } },
      });
    }

    const snap = await this.createSnapTransaction({
      orderId: order.orderId,
      amountMinor: order.amountMinor,
      customerName: user.displayName,
      customerEmail: user.primaryEmail ?? undefined,
    });

    await this.prisma.billingOrder.update({
      where: { id: order.id },
      data: {
        snapToken: snap.token,
        snapRedirectUrl: snap.redirect_url,
      },
    });

    return {
      orderId: order.orderId,
      amountMinor: order.amountMinor,
      currencyCode: order.currencyCode,
      planCode: plan.code,
      snapToken: snap.token,
      snapRedirectUrl: snap.redirect_url,
      clientKey: this.config.get<string>('MIDTRANS_CLIENT_KEY') ?? null,
      isProduction: this.config.get<string>('MIDTRANS_IS_PRODUCTION') === 'true',
      autoRenewRequested: Boolean(input.autoRenew),
      promoApplied: Boolean(promoId),
    };
  }

  async getOrder(authSubjectId: string, orderId: string) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    const order = await this.prisma.billingOrder.findFirst({
      where: { orderId, payerUserId: user.id },
      include: { plan: true, transactions: true },
    });
    if (!order) {
      throw ApiError.notFound(
        ErrorCodes.BILLING_ORDER_NOT_FOUND,
        'Order tidak ditemukan.',
      );
    }
    return {
      orderId: order.orderId,
      status: order.status,
      amountMinor: order.amountMinor,
      planCode: order.plan.code,
      paidAt: order.paidAt?.toISOString() ?? null,
      transactions: order.transactions.map((t) => ({
        status: t.transactionStatus,
        paymentType: t.paymentType,
        createdAt: t.createdAt.toISOString(),
      })),
    };
  }

  async listOrders(authSubjectId: string) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    const rows = await this.prisma.billingOrder.findMany({
      where: { payerUserId: user.id },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((o) => ({
      orderId: o.orderId,
      status: o.status,
      amountMinor: o.amountMinor,
      planCode: o.plan.code,
      planName: o.plan.name,
      createdAt: o.createdAt.toISOString(),
      paidAt: o.paidAt?.toISOString() ?? null,
    }));
  }

  async cancelSubscription(authSubjectId: string, subscriptionId: string) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    const sub = await this.prisma.subscription.findFirst({
      where: {
        id: subscriptionId,
        OR: [{ payerUserId: user.id }, { subjectUserId: user.id }],
      },
    });
    if (!sub) {
      throw ApiError.notFound(
        ErrorCodes.BILLING_ORDER_NOT_FOUND,
        'Subscription tidak ditemukan.',
      );
    }
    const updated = await this.prisma.subscription.update({
      where: { id: sub.id },
      data: {
        autoRenew: false,
        cancelAtPeriodEnd: true,
        canceledAt: new Date(),
        status:
          sub.status === SubscriptionStatus.ACTIVE
            ? SubscriptionStatus.CANCELED
            : sub.status,
      },
      include: { plan: true },
    });
    return this.mapSubscription(updated);
  }

  async handleMidtransWebhook(payload: Record<string, unknown>) {
    const serverKey = this.config.get<string>('MIDTRANS_SERVER_KEY');
    if (!serverKey) {
      throw new ApiError(
        ErrorCodes.CONFIG_MISSING,
        'MIDTRANS_SERVER_KEY belum dikonfigurasi.',
        503,
      );
    }

    const orderId = String(payload.order_id ?? '');
    const statusCode = String(payload.status_code ?? '');
    const grossAmount = String(payload.gross_amount ?? '');
    const signatureKey = String(payload.signature_key ?? '');
    const transactionStatus = String(payload.transaction_status ?? '');
    const fraudStatus = payload.fraud_status
      ? String(payload.fraud_status)
      : null;
    const transactionId = payload.transaction_id
      ? String(payload.transaction_id)
      : null;

    const eventHash = createHash('sha256')
      .update(JSON.stringify({ orderId, transactionId, transactionStatus, statusCode }))
      .digest('hex');

    const existingEvent = await this.prisma.billingWebhookEvent.findUnique({
      where: { eventHash },
    });
    if (existingEvent?.processingStatus === 'PROCESSED') {
      return { ok: true, duplicate: true };
    }

    const signatureValid = verifyMidtransSignature({
      orderId,
      statusCode,
      grossAmount,
      signatureKey,
      serverKey,
    });

    await this.prisma.billingWebhookEvent.upsert({
      where: { eventHash },
      create: {
        eventType: 'PAYMENT',
        eventHash,
        orderId,
        midtransTransactionId: transactionId,
        signatureValid,
        processingStatus: signatureValid ? 'RECEIVED' : 'FAILED',
        payload: this.sanitizePayload(payload),
      },
      update: {
        attemptCount: { increment: 1 },
        signatureValid,
      },
    });

    if (!signatureValid) {
      throw new ApiError(
        ErrorCodes.MIDTRANS_SIGNATURE_INVALID,
        'Signature Midtrans tidak valid.',
        400,
      );
    }

    const order = await this.prisma.billingOrder.findUnique({
      where: { orderId },
      include: { plan: true },
    });
    if (!order) {
      await this.prisma.billingWebhookEvent.update({
        where: { eventHash },
        data: { processingStatus: 'IGNORED', processedAt: new Date() },
      });
      return { ok: true, ignored: true };
    }

    const amountFromWebhook = Math.round(Number.parseFloat(grossAmount) * 1);
    // Midtrans gross_amount for IDR is full rupiah string e.g. "24900.00"
    const grossMinor = Math.round(Number.parseFloat(grossAmount));
    if (grossMinor !== order.amountMinor) {
      await this.prisma.billingOrder.update({
        where: { id: order.id },
        data: { status: BillingOrderStatus.REVIEW },
      });
      throw new ApiError(
        ErrorCodes.BILLING_AMOUNT_MISMATCH,
        'Nominal pembayaran tidak cocok.',
        400,
      );
    }

    await this.prisma.billingTransaction.upsert({
      where: {
        midtransTransactionId: transactionId ?? `local-${orderId}-${transactionStatus}`,
      },
      create: {
        billingOrderId: order.id,
        midtransTransactionId: transactionId ?? `local-${orderId}-${Date.now()}`,
        transactionStatus,
        fraudStatus,
        statusCode,
        paymentType: payload.payment_type
          ? String(payload.payment_type)
          : null,
        grossAmountMinor: grossMinor,
        currencyCode: order.currencyCode,
        transactionTime: payload.transaction_time
          ? new Date(String(payload.transaction_time))
          : null,
        settlementTime: payload.settlement_time
          ? new Date(String(payload.settlement_time))
          : null,
        rawReference: {
          payment_type: payload.payment_type ?? null,
          status: transactionStatus,
        },
      },
      update: {
        transactionStatus,
        fraudStatus,
        statusCode,
      },
    });

    if (!isPaidStatus(transactionStatus, fraudStatus)) {
      if (['deny', 'cancel', 'expire', 'failure'].includes(transactionStatus)) {
        await this.prisma.billingOrder.update({
          where: { id: order.id },
          data: {
            status:
              transactionStatus === 'expire'
                ? BillingOrderStatus.EXPIRED
                : BillingOrderStatus.FAILED,
          },
        });
      }
      await this.prisma.billingWebhookEvent.update({
        where: { eventHash },
        data: { processingStatus: 'PROCESSED', processedAt: new Date() },
      });
      return { ok: true, activated: false };
    }

    if (order.status === BillingOrderStatus.PAID) {
      await this.prisma.billingWebhookEvent.update({
        where: { eventHash },
        data: { processingStatus: 'PROCESSED', processedAt: new Date() },
      });
      return { ok: true, activated: true, already: true };
    }

    await this.activatePaidOrder(order.id);

    await this.prisma.billingWebhookEvent.update({
      where: { eventHash },
      data: { processingStatus: 'PROCESSED', processedAt: new Date() },
    });

    return { ok: true, activated: true };
  }

  private async activatePaidOrder(billingOrderDbId: string) {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.billingOrder.findUniqueOrThrow({
        where: { id: billingOrderDbId },
        include: { plan: true },
      });
      if (order.status === BillingOrderStatus.PAID) return;

      const now = new Date();
      const periodEnd = this.computePeriodEnd(now, order.plan);

      const subscription = await tx.subscription.create({
        data: {
          planId: order.planId,
          subjectType: order.subjectType,
          subjectUserId: order.subjectUserId,
          subjectGroupId: order.subjectGroupId,
          payerUserId: order.payerUserId,
          status: SubscriptionStatus.ACTIVE,
          autoRenew: order.plan.billingType === BillingType.RECURRING,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });

      const cfg = (order.plan.entitlementConfig ?? {}) as Record<
        string,
        unknown
      >;
      const entitlementRows: Prisma.SubscriptionEntitlementCreateManyInput[] =
        Object.entries(cfg).map(([featureKey, value]) => {
          if (typeof value === 'boolean') {
            return {
              subscriptionId: subscription.id,
              featureKey,
              valueType: 'BOOLEAN',
              booleanValue: value,
              effectiveFrom: now,
              effectiveUntil: periodEnd,
            };
          }
          if (typeof value === 'number') {
            return {
              subscriptionId: subscription.id,
              featureKey,
              valueType: 'INTEGER',
              integerValue: value,
              effectiveFrom: now,
              effectiveUntil: periodEnd,
            };
          }
          return {
            subscriptionId: subscription.id,
            featureKey,
            valueType: 'STRING',
            stringValue: String(value),
            effectiveFrom: now,
            effectiveUntil: periodEnd,
          };
        });

      if (entitlementRows.length) {
        await tx.subscriptionEntitlement.createMany({ data: entitlementRows });
      }

      await tx.billingOrder.update({
        where: { id: order.id },
        data: {
          status: BillingOrderStatus.PAID,
          paidAt: now,
          subscriptionId: subscription.id,
        },
      });

      // expire other active same-scope subscriptions (simple replace)
      await tx.subscription.updateMany({
        where: {
          id: { not: subscription.id },
          subjectType: order.subjectType,
          subjectUserId: order.subjectUserId,
          subjectGroupId: order.subjectGroupId,
          status: {
            in: [
              SubscriptionStatus.ACTIVE,
              SubscriptionStatus.CANCELED,
              SubscriptionStatus.GRACE_PERIOD,
            ],
          },
        },
        data: {
          status: SubscriptionStatus.EXPIRED,
          expiredAt: now,
        },
      });
    });
  }

  private computePeriodEnd(
    start: Date,
    plan: {
      durationUnit: string | null;
      durationValue: number | null;
      billingType: BillingType;
    },
  ) {
    const end = new Date(start);
    const value = plan.durationValue ?? 1;
    if (plan.durationUnit === 'day') {
      end.setDate(end.getDate() + value);
    } else if (plan.durationUnit === 'year') {
      end.setFullYear(end.getFullYear() + value);
    } else {
      end.setMonth(end.getMonth() + value);
    }
    return end;
  }

  private async createSnapTransaction(input: {
    orderId: string;
    amountMinor: number;
    customerName: string;
    customerEmail?: string;
  }): Promise<{ token: string; redirect_url: string }> {
    const serverKey = this.config.get<string>('MIDTRANS_SERVER_KEY');
    if (!serverKey) {
      // Dev fallback without Midtrans credentials
      this.logger.warn('MIDTRANS_SERVER_KEY missing â€” returning mock snap token');
      return {
        token: `mock-snap-${input.orderId}`,
        redirect_url: `${this.config.get('FRONTEND_ORIGINS')?.split(',')[0] ?? 'http://localhost:3000'}/checkout/result?order_id=${input.orderId}&mock=1`,
      };
    }

    const isProd =
      this.config.get<string>('MIDTRANS_IS_PRODUCTION') === 'true';
    const base = isProd
      ? 'https://app.midtrans.com'
      : 'https://app.sandbox.midtrans.com';

    const auth = Buffer.from(`${serverKey}:`).toString('base64');
    const res = await fetch(`${base}/snap/v1/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        transaction_details: {
          order_id: input.orderId,
          gross_amount: input.amountMinor,
        },
        customer_details: {
          first_name: input.customerName,
          email: input.customerEmail,
        },
        credit_card: { secure: true },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Midtrans Snap error: ${res.status} ${text}`);
      throw new ApiError(
        ErrorCodes.INTERNAL_ERROR,
        'Gagal membuat transaksi Midtrans.',
        502,
      );
    }

    const data = (await res.json()) as {
      token: string;
      redirect_url: string;
    };
    return data;
  }

  private sanitizePayload(payload: Record<string, unknown>) {
    const clone = { ...payload };
    delete clone.signature_key;
    return clone as Prisma.InputJsonValue;
  }

  private mapSubscription(s: {
    id: string;
    status: SubscriptionStatus;
    autoRenew: boolean;
    cancelAtPeriodEnd: boolean;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    subjectType: SubjectType;
    subjectUserId: string | null;
    subjectGroupId: string | null;
    plan: { code: string; name: string };
  }) {
    return {
      id: s.id,
      status: s.status,
      autoRenew: s.autoRenew,
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      planCode: s.plan.code,
      planName: s.plan.name,
      subjectType: s.subjectType,
      subjectUserId: s.subjectUserId,
      subjectGroupId: s.subjectGroupId,
      currentPeriodStart: s.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null,
    };
  }
}
