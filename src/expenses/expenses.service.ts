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

  async list(authSubjectId: string, groupId: string) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
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

  async get(authSubjectId: string, groupId: string, expenseId: string) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
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
    const attachments = await this.prisma.mediaAttachment.findMany({
      where: {
        groupId,
        entityType: AttachmentEntityType.EXPENSE,
        entityId: expenseId,
        deletedAt: null,
        status: AttachmentStatus.READY,
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return {
      ...this.mapExpense(expense),
      attachmentIds: attachments.map((a) => a.id),
    };
  }

  async create(authSubjectId: string, groupId: string, dto: CreateExpenseDto) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
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
    authSubjectId: string,
    groupId: string,
    expenseId: string,
    dto: UpdateExpenseDto,
  ) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
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

  async remove(authSubjectId: string, groupId: string, expenseId: string) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
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

  async findDuplicates(
    authSubjectId: string,
    groupId: string,
    input: {
      amountMinor: number;
      expenseDate: string;
      description?: string;
      merchantName?: string;
    },
  ) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    await this.membership.requireMember(groupId, user.id);
    const day = new Date(input.expenseDate);
    const start = new Date(day);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(day);
    end.setUTCHours(23, 59, 59, 999);
    const desc = (input.description ?? '').trim().toLowerCase();
    const merchant = (input.merchantName ?? '').trim().toLowerCase();
    const candidates = await this.prisma.expense.findMany({
      where: {
        groupId,
        deletedAt: null,
        amountMinor: input.amountMinor,
        expenseDate: { gte: start, lte: end },
      },
      take: 10,
      orderBy: { createdAt: 'desc' },
    });
    const matches = candidates.filter((c) => {
      if (!desc && !merchant) return true;
      const d = c.description.toLowerCase();
      const m = (c.merchantName ?? '').toLowerCase();
      return (
        (desc && (d.includes(desc) || desc.includes(d))) ||
        (merchant && m && (m.includes(merchant) || merchant.includes(m)))
      );
    });
    return {
      possibleDuplicates: matches.map((c) => ({
        id: c.id,
        description: c.description,
        amountMinor: c.amountMinor,
        expenseDate: c.expenseDate.toISOString().slice(0, 10),
        merchantName: c.merchantName,
      })),
    };
  }

  async listTemplates(authSubjectId: string, groupId: string) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    await this.membership.requireMember(groupId, user.id);
    const rows = await this.prisma.expenseTemplate.findMany({
      where: { groupId },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      amountMinor: r.amountMinor,
      splitMethod: r.splitMethod,
      category: r.category,
      payload: r.payload,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async createTemplate(
    authSubjectId: string,
    groupId: string,
    body: {
      name: string;
      description: string;
      amountMinor: number;
      splitMethod?: SplitMethod;
      category?: string;
      payload: Prisma.InputJsonValue;
    },
  ) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    await this.membership.requireMember(groupId, user.id, { write: true });
    const row = await this.prisma.expenseTemplate.create({
      data: {
        groupId,
        createdById: user.id,
        name: body.name.trim(),
        description: body.description.trim(),
        amountMinor: body.amountMinor,
        splitMethod: body.splitMethod ?? SplitMethod.EQUAL,
        category: body.category ?? null,
        payload: body.payload,
      },
    });
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      amountMinor: row.amountMinor,
      splitMethod: row.splitMethod,
      category: row.category,
      payload: row.payload,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async deleteTemplate(
    authSubjectId: string,
    groupId: string,
    templateId: string,
  ) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    await this.membership.requireMember(groupId, user.id, { write: true });
    await this.prisma.expenseTemplate.deleteMany({
      where: { id: templateId, groupId },
    });
    return { ok: true };
  }

  async listRecurring(authSubjectId: string, groupId: string) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    await this.membership.requireMember(groupId, user.id);
    const rows = await this.prisma.recurringExpense.findMany({
      where: { groupId },
      orderBy: { nextRunAt: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      description: r.description,
      amountMinor: r.amountMinor,
      splitMethod: r.splitMethod,
      category: r.category,
      frequency: r.frequency,
      nextRunAt: r.nextRunAt.toISOString(),
      active: r.active,
      lastExpenseId: r.lastExpenseId,
      payload: r.payload,
    }));
  }

  async createRecurring(
    authSubjectId: string,
    groupId: string,
    body: {
      description: string;
      amountMinor: number;
      splitMethod?: SplitMethod;
      category?: string;
      frequency?: 'WEEKLY' | 'MONTHLY';
      nextRunAt: string;
      payload: Prisma.InputJsonValue;
    },
  ) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    await this.membership.requireMember(groupId, user.id, { write: true });
    const row = await this.prisma.recurringExpense.create({
      data: {
        groupId,
        createdById: user.id,
        description: body.description.trim(),
        amountMinor: body.amountMinor,
        splitMethod: body.splitMethod ?? SplitMethod.EQUAL,
        category: body.category ?? null,
        frequency: body.frequency === 'WEEKLY' ? 'WEEKLY' : 'MONTHLY',
        nextRunAt: new Date(body.nextRunAt),
        payload: body.payload,
      },
    });
    return {
      id: row.id,
      description: row.description,
      amountMinor: row.amountMinor,
      frequency: row.frequency,
      nextRunAt: row.nextRunAt.toISOString(),
      active: row.active,
    };
  }

  async setRecurringActive(
    authSubjectId: string,
    groupId: string,
    recurringId: string,
    active: boolean,
  ) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    await this.membership.requireMember(groupId, user.id, { write: true });
    await this.prisma.recurringExpense.updateMany({
      where: { id: recurringId, groupId },
      data: { active },
    });
    return { ok: true, active };
  }

  async runDueRecurring() {
    const now = new Date();
    const due = await this.prisma.recurringExpense.findMany({
      where: { active: true, nextRunAt: { lte: now } },
      take: 50,
    });
    let created = 0;
    for (const r of due) {
      try {
        const payload = (r.payload ?? {}) as Record<string, unknown>;
        const participantIds = Array.isArray(payload.participantIds)
          ? (payload.participantIds as string[])
          : [];
        const payerId =
          typeof payload.payerId === 'string' ? payload.payerId : r.createdById;
        const dto: CreateExpenseDto = {
          description: r.description,
          amountMinor: r.amountMinor,
          expenseDate: now.toISOString().slice(0, 10),
          splitMethod: r.splitMethod,
          category: r.category ?? undefined,
          payers: [{ userId: payerId, amountMinor: r.amountMinor }],
          participantIds:
            participantIds.length > 0 ? participantIds : [payerId],
        };
        // system run as creator subject
        const creator = await this.prisma.user.findUnique({
          where: { id: r.createdById },
        });
        if (!creator) continue;
        const expense = await this.create(
          creator.authSubjectId,
          r.groupId,
          dto,
        );
        const next = new Date(r.nextRunAt);
        if (r.frequency === 'WEEKLY') {
          next.setUTCDate(next.getUTCDate() + 7);
        } else {
          next.setUTCMonth(next.getUTCMonth() + 1);
        }
        await this.prisma.recurringExpense.update({
          where: { id: r.id },
          data: { lastExpenseId: expense.id, nextRunAt: next },
        });
        created += 1;
      } catch {
        // skip failed row
      }
    }
    return { processed: due.length, created };
  }
}
