import { Injectable } from '@nestjs/common';
import {
  AttachmentEntityType,
  AttachmentStatus,
  ItemSource,
  LedgerSourceType,
  MemberRole,
  Prisma,
  SplitMethod,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError } from '../common/errors/api-error';
import { ErrorCodes } from '../common/errors/error-codes';
import { requireInternalUser } from '../common/users/resolve-user';
import { MembershipService } from '../groups/membership.service';
import { LedgerService } from '../ledger/ledger.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpenseSplitService } from './expense-split.service';

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membership: MembershipService,
    private readonly splitService: ExpenseSplitService,
    private readonly ledger: LedgerService,
  ) {}

  private mapExpense(expense: {
    id: string;
    groupId: string;
    description: string;
    merchantName: string | null;
    amountMinor: number;
    currencyCode: string;
    expenseDate: Date;
    splitMethod: SplitMethod;
    subtotalMinor: number;
    taxMinor: number;
    serviceChargeMinor: number;
    discountMinor: number;
    tipMinor: number;
    category: string | null;
    notes: string | null;
    createdById: string;
    version: number;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
    payers?: Array<{ userId: string; amountMinor: number }>;
    splits?: Array<{
      userId: string;
      amountMinor: number;
      percentage: Prisma.Decimal | null;
    }>;
    items?: Array<{
      id: string;
      name: string;
      quantity: Prisma.Decimal;
      unitPriceMinor: number;
      lineTotalMinor: number;
      source: ItemSource;
      aiConfidence: number | null;
      sortOrder: number;
      allocations: Array<{ userId: string; amountMinor: number }>;
    }>;
  }) {
    return {
      id: expense.id,
      groupId: expense.groupId,
      description: expense.description,
      merchantName: expense.merchantName,
      amountMinor: expense.amountMinor,
      currencyCode: expense.currencyCode,
      expenseDate: expense.expenseDate.toISOString().slice(0, 10),
      splitMethod: expense.splitMethod,
      subtotalMinor: expense.subtotalMinor,
      taxMinor: expense.taxMinor,
      serviceChargeMinor: expense.serviceChargeMinor,
      discountMinor: expense.discountMinor,
      tipMinor: expense.tipMinor,
      category: expense.category,
      notes: expense.notes,
      createdById: expense.createdById,
      version: expense.version,
      createdAt: expense.createdAt.toISOString(),
      updatedAt: expense.updatedAt.toISOString(),
      deletedAt: expense.deletedAt?.toISOString() ?? null,
      payers: expense.payers?.map((p) => ({
        userId: p.userId,
        amountMinor: p.amountMinor,
      })),
      splits: expense.splits?.map((s) => ({
        userId: s.userId,
        amountMinor: s.amountMinor,
        percentage: s.percentage != null ? Number(s.percentage) : null,
      })),
      items: expense.items?.map((i) => ({
        id: i.id,
        name: i.name,
        quantity: Number(i.quantity),
        unitPriceMinor: i.unitPriceMinor,
        lineTotalMinor: i.lineTotalMinor,
        source: i.source,
        aiConfidence: i.aiConfidence,
        sortOrder: i.sortOrder,
        allocations: i.allocations,
      })),
    };
  }

  async list(clerkUserId: string, groupId: string) {
    const user = await requireInternalUser(this.prisma, clerkUserId);
    await this.membership.requireMember(groupId, user.id);

    const expenses = await this.prisma.expense.findMany({
      where: { groupId, deletedAt: null },
      include: {
        payers: true,
        splits: true,
      },
      orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });

    return expenses.map((e) => this.mapExpense(e));
  }

  async get(clerkUserId: string, groupId: string, expenseId: string) {
    const user = await requireInternalUser(this.prisma, clerkUserId);
    await this.membership.requireMember(groupId, user.id);
    const expense = await this.prisma.expense.findFirst({
      where: { id: expenseId, groupId, deletedAt: null },
      include: {
        payers: true,
        splits: true,
        items: { include: { allocations: true }, orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!expense) {
      throw ApiError.notFound(
        ErrorCodes.EXPENSE_NOT_FOUND,
        'Pengeluaran tidak ditemukan.',
      );
    }
    return this.mapExpense(expense);
  }

  async create(clerkUserId: string, groupId: string, dto: CreateExpenseDto) {
    const user = await requireInternalUser(this.prisma, clerkUserId);
    const ctx = await this.membership.requireMember(groupId, user.id, {
      write: true,
    });

    const computed = this.splitService.compute(dto);
    const involved = [
      ...computed.payers.map((p) => p.userId),
      ...computed.splits.map((s) => s.userId),
    ];
    await this.membership.requireActiveMemberIds(groupId, involved);

    const expense = await this.prisma.$transaction(async (tx) => {
      const created = await tx.expense.create({
        data: {
          groupId,
          description: dto.description.trim(),
          merchantName: dto.merchantName?.trim() || null,
          amountMinor: dto.amountMinor,
          currencyCode: ctx.currencyCode,
          expenseDate: new Date(dto.expenseDate),
          splitMethod: dto.splitMethod,
          subtotalMinor: dto.subtotalMinor ?? 0,
          taxMinor: dto.taxMinor ?? 0,
          serviceChargeMinor: dto.serviceChargeMinor ?? 0,
          discountMinor: dto.discountMinor ?? 0,
          tipMinor: dto.tipMinor ?? 0,
          category: dto.category ?? null,
          notes: dto.notes ?? null,
          createdById: user.id,
          payers: {
            create: computed.payers.map((p) => ({
              userId: p.userId,
              amountMinor: p.amountMinor,
            })),
          },
          splits: {
            create: computed.splits.map((s) => ({
              userId: s.userId,
              amountMinor: s.amountMinor,
              percentage:
                s.percentage != null
                  ? new Prisma.Decimal(s.percentage)
                  : null,
            })),
          },
        },
      });

      if (computed.items.length > 0) {
        let order = 0;
        for (const item of computed.items) {
          await tx.expenseItem.create({
            data: {
              expenseId: created.id,
              name: item.name,
              quantity: new Prisma.Decimal(item.quantity),
              unitPriceMinor: item.unitPriceMinor,
              lineTotalMinor: item.lineTotalMinor,
              source:
                item.aiConfidence != null ? ItemSource.AI : ItemSource.MANUAL,
              aiConfidence: item.aiConfidence ?? null,
              sortOrder: order++,
              allocations: {
                create: item.allocations.map((a) => ({
                  userId: a.userId,
                  amountMinor: a.amountMinor,
                })),
              },
            },
          });
        }
      }

      if (dto.attachmentIds?.length) {
        await tx.mediaAttachment.updateMany({
          where: {
            id: { in: dto.attachmentIds },
            groupId,
            uploadedById: user.id,
            status: AttachmentStatus.READY,
            deletedAt: null,
          },
          data: {
            entityType: AttachmentEntityType.EXPENSE,
            entityId: created.id,
          },
        });
      }

      const deltas = this.ledger.buildExpenseDeltas(
        computed.payers,
        computed.splits,
      );
      await this.ledger.post(tx, {
        groupId,
        sourceType: LedgerSourceType.EXPENSE,
        sourceId: created.id,
        currencyCode: ctx.currencyCode,
        deltas,
      });

      await tx.activityEvent.create({
        data: {
          groupId,
          actorUserId: user.id,
          eventType: 'expense.created',
          entityType: 'expense',
          entityId: created.id,
          payload: {
            amountMinor: created.amountMinor,
            description: created.description,
          },
        },
      });

      return tx.expense.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          payers: true,
          splits: true,
          items: {
            include: { allocations: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
      });
    });

    return this.mapExpense(expense);
  }

  async update(
    clerkUserId: string,
    groupId: string,
    expenseId: string,
    dto: UpdateExpenseDto,
  ) {
    const user = await requireInternalUser(this.prisma, clerkUserId);
    const ctx = await this.membership.requireMember(groupId, user.id, {
      write: true,
    });

    const existing = await this.prisma.expense.findFirst({
      where: { id: expenseId, groupId, deletedAt: null },
    });
    if (!existing) {
      throw ApiError.notFound(
        ErrorCodes.EXPENSE_NOT_FOUND,
        'Pengeluaran tidak ditemukan.',
      );
    }

    if (
      existing.createdById !== user.id &&
      ctx.role === MemberRole.MEMBER
    ) {
      throw ApiError.forbidden('Hanya pembuat, admin, atau owner yang dapat mengedit.');
    }

    if (dto.version != null && dto.version !== existing.version) {
      throw new ApiError(
        ErrorCodes.VERSION_CONFLICT,
        'Data sudah diubah orang lain. Muat ulang lalu coba lagi.',
        409,
      );
    }

    const computed = this.splitService.compute(dto);
    const involved = [
      ...computed.payers.map((p) => p.userId),
      ...computed.splits.map((s) => s.userId),
    ];
    await this.membership.requireActiveMemberIds(groupId, involved);

    const expense = await this.prisma.$transaction(async (tx) => {
      await this.ledger.reverseSource(tx, {
        groupId,
        sourceType: LedgerSourceType.EXPENSE,
        sourceId: expenseId,
        reverseSourceType: LedgerSourceType.EXPENSE_REVERSAL,
      });

      await tx.expensePayer.deleteMany({ where: { expenseId } });
      await tx.expenseSplit.deleteMany({ where: { expenseId } });
      await tx.expenseItemAllocation.deleteMany({
        where: { expenseItem: { expenseId } },
      });
      await tx.expenseItem.deleteMany({ where: { expenseId } });

      const updated = await tx.expense.update({
        where: { id: expenseId },
        data: {
          description: dto.description.trim(),
          merchantName: dto.merchantName?.trim() || null,
          amountMinor: dto.amountMinor,
          expenseDate: new Date(dto.expenseDate),
          splitMethod: dto.splitMethod,
          subtotalMinor: dto.subtotalMinor ?? 0,
          taxMinor: dto.taxMinor ?? 0,
          serviceChargeMinor: dto.serviceChargeMinor ?? 0,
          discountMinor: dto.discountMinor ?? 0,
          tipMinor: dto.tipMinor ?? 0,
          category: dto.category ?? null,
          notes: dto.notes ?? null,
          version: { increment: 1 },
          payers: {
            create: computed.payers.map((p) => ({
              userId: p.userId,
              amountMinor: p.amountMinor,
            })),
          },
          splits: {
            create: computed.splits.map((s) => ({
              userId: s.userId,
              amountMinor: s.amountMinor,
              percentage:
                s.percentage != null
                  ? new Prisma.Decimal(s.percentage)
                  : null,
            })),
          },
        },
      });

      if (computed.items.length > 0) {
        let order = 0;
        for (const item of computed.items) {
          await tx.expenseItem.create({
            data: {
              expenseId,
              name: item.name,
              quantity: new Prisma.Decimal(item.quantity),
              unitPriceMinor: item.unitPriceMinor,
              lineTotalMinor: item.lineTotalMinor,
              source:
                item.aiConfidence != null ? ItemSource.AI : ItemSource.MANUAL,
              aiConfidence: item.aiConfidence ?? null,
              sortOrder: order++,
              allocations: {
                create: item.allocations.map((a) => ({
                  userId: a.userId,
                  amountMinor: a.amountMinor,
                })),
              },
            },
          });
        }
      }

      await this.ledger.post(tx, {
        groupId,
        sourceType: LedgerSourceType.EXPENSE,
        sourceId: expenseId,
        currencyCode: ctx.currencyCode,
        deltas: this.ledger.buildExpenseDeltas(
          computed.payers,
          computed.splits,
        ),
      });

      await tx.activityEvent.create({
        data: {
          groupId,
          actorUserId: user.id,
          eventType: 'expense.updated',
          entityType: 'expense',
          entityId: expenseId,
          payload: { version: updated.version + 1 },
        },
      });

      return tx.expense.findUniqueOrThrow({
        where: { id: expenseId },
        include: {
          payers: true,
          splits: true,
          items: {
            include: { allocations: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
      });
    });

    return this.mapExpense(expense);
  }

  async remove(clerkUserId: string, groupId: string, expenseId: string) {
    const user = await requireInternalUser(this.prisma, clerkUserId);
    const ctx = await this.membership.requireMember(groupId, user.id, {
      write: true,
    });

    const existing = await this.prisma.expense.findFirst({
      where: { id: expenseId, groupId, deletedAt: null },
    });
    if (!existing) {
      throw ApiError.notFound(
        ErrorCodes.EXPENSE_NOT_FOUND,
        'Pengeluaran tidak ditemukan.',
      );
    }

    if (
      existing.createdById !== user.id &&
      ctx.role === MemberRole.MEMBER
    ) {
      throw ApiError.forbidden('Hanya pembuat, admin, atau owner yang dapat menghapus.');
    }

    await this.prisma.$transaction(async (tx) => {
      await this.ledger.reverseSource(tx, {
        groupId,
        sourceType: LedgerSourceType.EXPENSE,
        sourceId: expenseId,
        reverseSourceType: LedgerSourceType.EXPENSE_REVERSAL,
      });
      await tx.expense.update({
        where: { id: expenseId },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      });
      await tx.activityEvent.create({
        data: {
          groupId,
          actorUserId: user.id,
          eventType: 'expense.deleted',
          entityType: 'expense',
          entityId: expenseId,
        },
      });
    });

    return { ok: true };
  }
}
