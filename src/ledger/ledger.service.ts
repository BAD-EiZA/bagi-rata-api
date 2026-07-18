import { Injectable } from '@nestjs/common';
import {
  LedgerSourceType,
  LedgerStatus,
  MemberStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type BalanceDelta = {
  userId: string;
  amountMinorSigned: number;
};

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async post(
    tx: Prisma.TransactionClient,
    input: {
      groupId: string;
      sourceType: LedgerSourceType;
      sourceId: string;
      currencyCode: string;
      deltas: BalanceDelta[];
      reversesTransactionId?: string;
    },
  ) {
    const filtered = input.deltas.filter((d) => d.amountMinorSigned !== 0);
    const sum = filtered.reduce((a, b) => a + b.amountMinorSigned, 0);
    if (sum !== 0) {
      throw new Error(`LEDGER_UNBALANCED:${sum}`);
    }
    if (filtered.length === 0) return null;

    const txn = await tx.ledgerTransaction.create({
      data: {
        groupId: input.groupId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        status: LedgerStatus.POSTED,
        reversesTransactionId: input.reversesTransactionId,
        entries: {
          create: filtered.map((d) => ({
            userId: d.userId,
            amountMinorSigned: d.amountMinorSigned,
            currencyCode: input.currencyCode,
          })),
        },
      },
    });
    return txn;
  }

  /** Expense: payer +amount, participants -amount (owed). */
  buildExpenseDeltas(
    payers: Array<{ userId: string; amountMinor: number }>,
    splits: Array<{ userId: string; amountMinor: number }>,
  ): BalanceDelta[] {
    const map = new Map<string, number>();
    for (const p of payers) {
      map.set(p.userId, (map.get(p.userId) ?? 0) + p.amountMinor);
    }
    for (const s of splits) {
      map.set(s.userId, (map.get(s.userId) ?? 0) - s.amountMinor);
    }
    return [...map.entries()].map(([userId, amountMinorSigned]) => ({
      userId,
      amountMinorSigned,
    }));
  }

  async reverseSource(
    tx: Prisma.TransactionClient,
    input: {
      groupId: string;
      sourceType: LedgerSourceType;
      sourceId: string;
      reverseSourceType: LedgerSourceType;
    },
  ) {
    const existing = await tx.ledgerTransaction.findFirst({
      where: {
        groupId: input.groupId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        status: LedgerStatus.POSTED,
      },
      include: { entries: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!existing) return null;

    await tx.ledgerTransaction.update({
      where: { id: existing.id },
      data: { status: LedgerStatus.REVERSED },
    });

    return this.post(tx, {
      groupId: input.groupId,
      sourceType: input.reverseSourceType,
      sourceId: input.sourceId,
      currencyCode: existing.entries[0]?.currencyCode ?? 'IDR',
      reversesTransactionId: existing.id,
      deltas: existing.entries.map((e) => ({
        userId: e.userId,
        amountMinorSigned: -e.amountMinorSigned,
      })),
    });
  }

  async getGroupBalances(groupId: string) {
    const entries = await this.prisma.ledgerEntry.findMany({
      where: {
        ledgerTransaction: {
          groupId,
          status: LedgerStatus.POSTED,
        },
      },
      select: {
        userId: true,
        amountMinorSigned: true,
        currencyCode: true,
      },
    });

    const members = await this.prisma.groupMember.findMany({
      where: { groupId, status: MemberStatus.ACTIVE },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    const map = new Map<string, number>();
    let currencyCode = 'IDR';
    for (const e of entries) {
      currencyCode = e.currencyCode;
      map.set(e.userId, (map.get(e.userId) ?? 0) + e.amountMinorSigned);
    }

    return members.map((m) => ({
      userId: m.userId,
      displayName: m.user.displayName,
      avatarUrl: m.user.avatarUrl,
      balanceMinor: map.get(m.userId) ?? 0,
      currencyCode,
    }));
  }

  async getMemberBalance(groupId: string, userId: string): Promise<number> {
    const agg = await this.prisma.ledgerEntry.aggregate({
      where: {
        userId,
        ledgerTransaction: {
          groupId,
          status: LedgerStatus.POSTED,
        },
      },
      _sum: { amountMinorSigned: true },
    });
    return agg._sum.amountMinorSigned ?? 0;
  }
}
