import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { requireInternalUser } from '../common/users/resolve-user';
import { MembershipService } from '../groups/membership.service';
import { LedgerService } from '../ledger/ledger.service';

@Injectable()
export class InsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membership: MembershipService,
    private readonly ledger: LedgerService,
  ) {}

  async groupInsights(clerkUserId: string, groupId: string) {
    const user = await requireInternalUser(this.prisma, clerkUserId);
    await this.membership.requireMember(groupId, user.id);

    const expenses = await this.prisma.expense.findMany({
      where: { groupId, deletedAt: null },
      include: { payers: true, splits: true },
    });

    const totalExpenseMinor = expenses.reduce(
      (a, e) => a + e.amountMinor,
      0,
    );
    const transactionCount = expenses.length;
    const avgTransactionMinor =
      transactionCount > 0
        ? Math.round(totalExpenseMinor / transactionCount)
        : 0;

    const byCategory = new Map<string, number>();
    const byMerchant = new Map<string, number>();
    let withAttachmentHint = 0;

    for (const e of expenses) {
      const cat = e.category || 'Lainnya';
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + e.amountMinor);
      if (e.merchantName) {
        byMerchant.set(
          e.merchantName,
          (byMerchant.get(e.merchantName) ?? 0) + e.amountMinor,
        );
      }
    }

    const attachmentCount = await this.prisma.mediaAttachment.count({
      where: {
        groupId,
        entityType: 'EXPENSE',
        deletedAt: null,
        status: 'READY',
      },
    });
    withAttachmentHint = attachmentCount;

    const settlements = await this.prisma.settlement.findMany({
      where: { groupId, deletedAt: null },
    });
    const confirmedSettlements = settlements.filter(
      (s) => s.status === 'CONFIRMED',
    ).length;
    const settlementConfirmRate =
      settlements.length > 0
        ? confirmedSettlements / settlements.length
        : 1;

    const balances = await this.ledger.getGroupBalances(groupId);
    const members = await this.prisma.groupMember.count({
      where: { groupId, status: 'ACTIVE' },
    });

    const paidByUser = new Map<string, number>();
    const owedByUser = new Map<string, number>();
    for (const e of expenses) {
      for (const p of e.payers) {
        paidByUser.set(p.userId, (paidByUser.get(p.userId) ?? 0) + p.amountMinor);
      }
      for (const s of e.splits) {
        owedByUser.set(s.userId, (owedByUser.get(s.userId) ?? 0) + s.amountMinor);
      }
    }

    const largest = expenses
      .slice()
      .sort((a, b) => b.amountMinor - a.amountMinor)[0];

    return {
      groupId,
      period: 'all_time',
      currencyCode: expenses[0]?.currencyCode ?? 'IDR',
      metrics: {
        totalExpenseMinor,
        transactionCount,
        avgTransactionMinor,
        activeMemberCount: members,
        expenseWithAttachmentCount: withAttachmentHint,
        settlementConfirmRate,
        byCategory: [...byCategory.entries()]
          .map(([category, amountMinor]) => ({ category, amountMinor }))
          .sort((a, b) => b.amountMinor - a.amountMinor),
        topMerchants: [...byMerchant.entries()]
          .map(([merchant, amountMinor]) => ({ merchant, amountMinor }))
          .sort((a, b) => b.amountMinor - a.amountMinor)
          .slice(0, 5),
        largestTransaction: largest
          ? {
              id: largest.id,
              description: largest.description,
              amountMinor: largest.amountMinor,
              expenseDate: largest.expenseDate.toISOString().slice(0, 10),
            }
          : null,
        memberBreakdown: balances.map((b) => ({
          userId: b.userId,
          displayName: b.displayName,
          paidMinor: paidByUser.get(b.userId) ?? 0,
          owedMinor: owedByUser.get(b.userId) ?? 0,
          balanceMinor: b.balanceMinor,
        })),
      },
      notes: [
        'paidMinor = uang yang ditalangi',
        'owedMinor = bagian tanggungan sebenarnya',
      ],
    };
  }

  async personalInsights(clerkUserId: string) {
    const user = await requireInternalUser(this.prisma, clerkUserId);

    const memberships = await this.prisma.groupMember.findMany({
      where: { userId: user.id, status: 'ACTIVE' },
      include: { group: true },
    });

    const groupIds = memberships.map((m) => m.groupId);
    const expenses = await this.prisma.expense.findMany({
      where: { groupId: { in: groupIds }, deletedAt: null },
      include: { payers: true, splits: true },
    });

    let paidMinor = 0;
    let owedMinor = 0;
    const byCategory = new Map<string, number>();
    const byGroup = new Map<string, number>();

    for (const e of expenses) {
      for (const p of e.payers) {
        if (p.userId === user.id) paidMinor += p.amountMinor;
      }
      for (const s of e.splits) {
        if (s.userId === user.id) {
          owedMinor += s.amountMinor;
          const cat = e.category || 'Lainnya';
          byCategory.set(cat, (byCategory.get(cat) ?? 0) + s.amountMinor);
          byGroup.set(
            e.groupId,
            (byGroup.get(e.groupId) ?? 0) + s.amountMinor,
          );
        }
      }
    }

    const confirmedSettlements = await this.prisma.settlement.aggregate({
      where: {
        fromUserId: user.id,
        status: 'CONFIRMED',
        deletedAt: null,
      },
      _sum: { amountMinor: true },
    });

    const groupName = new Map(
      memberships.map((m) => [m.groupId, m.group.name]),
    );

    return {
      userId: user.id,
      period: 'all_time',
      metrics: {
        totalPaidMinor: paidMinor,
        totalOwedMinor: owedMinor,
        confirmedSettlementPaidMinor:
          confirmedSettlements._sum.amountMinor ?? 0,
        byCategory: [...byCategory.entries()]
          .map(([category, amountMinor]) => ({ category, amountMinor }))
          .sort((a, b) => b.amountMinor - a.amountMinor),
        byGroup: [...byGroup.entries()]
          .map(([groupId, amountMinor]) => ({
            groupId,
            groupName: groupName.get(groupId) ?? groupId,
            amountMinor,
          }))
          .sort((a, b) => b.amountMinor - a.amountMinor),
      },
      notes: [
        'Nilai per mata uang tidak digabung; data saat ini asumsi IDR per grup.',
      ],
    };
  }
}
