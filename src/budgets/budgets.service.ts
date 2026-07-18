import { Injectable } from '@nestjs/common';
import { BudgetPeriod, MemberRole, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { requireInternalUser } from '../common/users/resolve-user';
import { MembershipService } from '../groups/membership.service';
import { ApiError } from '../common/errors/api-error';
import { ErrorCodes } from '../common/errors/error-codes';
import { CreateBudgetDto } from './dto/create-budget.dto';

@Injectable()
export class BudgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membership: MembershipService,
  ) {}

  async list(authSubjectId: string, groupId: string) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    await this.membership.requireMember(groupId, user.id);
    await this.requireBudgetEnabled(groupId);

    const budgets = await this.prisma.groupBudget.findMany({
      where: { groupId, archivedAt: null },
      orderBy: { periodStart: 'desc' },
    });

    const withSpend = await Promise.all(
      budgets.map(async (b) => {
        const spent = await this.spentInPeriod(
          groupId,
          b.periodStart,
          b.periodEnd,
          b.category,
        );
        return this.mapBudget(b, spent);
      }),
    );
    return withSpend;
  }

  async create(authSubjectId: string, groupId: string, dto: CreateBudgetDto) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    await this.membership.requireMember(groupId, user.id, {
      write: true,
      roles: [MemberRole.OWNER, MemberRole.ADMIN],
    });

    const group = await this.requireBudgetEnabled(groupId);

    const periodEnd =
      dto.periodEnd != null
        ? new Date(dto.periodEnd)
        : this.defaultPeriodEnd(
            new Date(dto.periodStart),
            dto.period ?? BudgetPeriod.MONTHLY,
          );

    const budget = await this.prisma.groupBudget.create({
      data: {
        groupId,
        name: dto.name.trim(),
        period: dto.period ?? BudgetPeriod.MONTHLY,
        amountMinor: dto.amountMinor,
        currencyCode: group.currencyCode,
        category: dto.category?.trim() || null,
        periodStart: new Date(dto.periodStart),
        periodEnd,
        alertThreshold: dto.alertThreshold ?? 80,
        createdById: user.id,
      },
    });

    const spent = await this.spentInPeriod(
      groupId,
      budget.periodStart,
      budget.periodEnd,
      budget.category,
    );
    return this.mapBudget(budget, spent);
  }

  async remove(authSubjectId: string, groupId: string, budgetId: string) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    await this.membership.requireMember(groupId, user.id, {
      write: true,
      roles: [MemberRole.OWNER, MemberRole.ADMIN],
    });
    await this.requireBudgetEnabled(groupId);
    const existing = await this.prisma.groupBudget.findFirst({
      where: { id: budgetId, groupId, archivedAt: null },
    });
    if (!existing) {
      throw ApiError.notFound(
        ErrorCodes.VALIDATION_FAILED,
        'Budget tidak ditemukan.',
      );
    }
    await this.prisma.groupBudget.update({
      where: { id: budgetId },
      data: { archivedAt: new Date() },
    });
    return { ok: true };
  }

  async forecast(authSubjectId: string, groupId: string) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    await this.membership.requireMember(groupId, user.id);
    await this.requireBudgetEnabled(groupId);

    const now = new Date();
    const months: Array<{
      key: string;
      start: Date;
      end: Date;
      totalMinor: number;
    }> = [];

    for (let i = 5; i >= 0; i--) {
      const start = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1),
      );
      const end = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1),
      );
      const agg = await this.prisma.expense.aggregate({
        where: {
          groupId,
          deletedAt: null,
          expenseDate: { gte: start, lt: end },
        },
        _sum: { amountMinor: true },
      });
      months.push({
        key: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`,
        start,
        end,
        totalMinor: agg._sum.amountMinor ?? 0,
      });
    }

    const nonZero = months.filter((m) => m.totalMinor > 0);
    const avgMinor =
      nonZero.length > 0
        ? Math.round(
            nonZero.reduce((a, m) => a + m.totalMinor, 0) / nonZero.length,
          )
        : 0;

    // simple linear trend on last 3 months
    const last3 = months.slice(-3);
    const trend =
      last3.length === 3
        ? (last3[2].totalMinor - last3[0].totalMinor) / 2
        : 0;
    const nextMonthForecast = Math.max(
      0,
      Math.round(avgMinor + trend),
    );

    const currentMonth = months[months.length - 1];
    const dayOfMonth = now.getUTCDate();
    const daysInMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
    ).getUTCDate();
    const paceProjected =
      dayOfMonth > 0
        ? Math.round((currentMonth.totalMinor / dayOfMonth) * daysInMonth)
        : 0;

    const budgets = await this.list(authSubjectId, groupId);
    const activeBudget = budgets[0] ?? null;

    return {
      groupId,
      history: months.map((m) => ({
        month: m.key,
        totalMinor: m.totalMinor,
      })),
      averageMonthlyMinor: avgMinor,
      nextMonthForecastMinor: nextMonthForecast,
      currentMonthSpentMinor: currentMonth.totalMinor,
      currentMonthPaceProjectedMinor: paceProjected,
      activeBudget,
      notes: [
        'Forecast = rata-rata 6 bulan + tren linear 3 bulan terakhir.',
        'Pace = proyeksi akhir bulan dari run-rate harian bulan berjalan.',
      ],
    };
  }

  private async spentInPeriod(
    groupId: string,
    periodStart: Date,
    periodEnd: Date | null,
    category: string | null,
  ): Promise<number> {
    const end =
      periodEnd ??
      new Date(
        Date.UTC(
          periodStart.getUTCFullYear(),
          periodStart.getUTCMonth() + 1,
          1,
        ),
      );

    const where: Prisma.ExpenseWhereInput = {
      groupId,
      deletedAt: null,
      expenseDate: {
        gte: periodStart,
        lt: end,
      },
    };
    if (category) {
      where.category = { equals: category, mode: 'insensitive' };
    }

    const agg = await this.prisma.expense.aggregate({
      where,
      _sum: { amountMinor: true },
    });
    return agg._sum.amountMinor ?? 0;
  }

  private async requireBudgetEnabled(groupId: string) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
    });
    if (!group) {
      throw ApiError.notFound(ErrorCodes.GROUP_NOT_FOUND, 'Grup tidak ditemukan.');
    }
    if (!group.budgetEnabled) {
      throw new ApiError(
        ErrorCodes.BUDGET_DISABLED,
        'Fitur budget tidak aktif di grup ini. Owner dapat mengaktifkannya di pengaturan grup.',
        403,
      );
    }
    return group;
  }

  private defaultPeriodEnd(start: Date, period: BudgetPeriod): Date {
    const end = new Date(start);
    if (period === BudgetPeriod.WEEKLY) {
      end.setUTCDate(end.getUTCDate() + 7);
    } else {
      end.setUTCMonth(end.getUTCMonth() + 1);
    }
    return end;
  }

  private mapBudget(
    b: {
      id: string;
      groupId: string;
      name: string;
      period: BudgetPeriod;
      amountMinor: number;
      currencyCode: string;
      category: string | null;
      periodStart: Date;
      periodEnd: Date | null;
      alertThreshold: number;
      createdAt: Date;
    },
    spentMinor: number,
  ) {
    const remainingMinor = b.amountMinor - spentMinor;
    const usedPercent =
      b.amountMinor > 0
        ? Math.round((spentMinor / b.amountMinor) * 1000) / 10
        : 0;
    return {
      id: b.id,
      groupId: b.groupId,
      name: b.name,
      period: b.period,
      amountMinor: b.amountMinor,
      currencyCode: b.currencyCode,
      category: b.category,
      periodStart: b.periodStart.toISOString().slice(0, 10),
      periodEnd: b.periodEnd?.toISOString().slice(0, 10) ?? null,
      alertThreshold: b.alertThreshold,
      spentMinor,
      remainingMinor,
      usedPercent,
      overBudget: spentMinor > b.amountMinor,
      alertTriggered: usedPercent >= b.alertThreshold,
      createdAt: b.createdAt.toISOString(),
    };
  }
}
