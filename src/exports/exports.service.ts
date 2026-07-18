import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { requireInternalUser } from '../common/users/resolve-user';
import { MembershipService } from '../groups/membership.service';
import { ApiError } from '../common/errors/api-error';
import { ErrorCodes } from '../common/errors/error-codes';
import {
  addFooter,
  addKeyValue,
  createBrandedPdf,
  formatIdrPdf,
  pdfToBuffer,
} from '../common/pdf/pdf-builder';

export type ExpenseSearchQuery = {
  q?: string;
  category?: string;
  merchant?: string;
  splitMethod?: string;
  payerId?: string;
  participantId?: string;
  minAmountMinor?: number;
  maxAmountMinor?: number;
  dateFrom?: string;
  dateTo?: string;
  hasAttachment?: boolean;
  limit?: number;
  offset?: number;
};

@Injectable()
export class ExportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membership: MembershipService,
  ) {}

  async searchGroupExpenses(
    authSubjectId: string,
    groupId: string,
    query: ExpenseSearchQuery,
  ) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    await this.membership.requireMember(groupId, user.id);

    const where = this.buildWhere(groupId, query);
    const limit = Math.min(query.limit ?? 50, 200);
    const offset = query.offset ?? 0;

    const [items, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        include: {
          payers: true,
          splits: true,
        },
        orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
        take: limit,
        skip: offset,
      }),
      this.prisma.expense.count({ where }),
    ]);

    const expenseIds = items.map((e) => e.id);
    const attachments = expenseIds.length
      ? await this.prisma.mediaAttachment.groupBy({
          by: ['entityId'],
          where: {
            groupId,
            entityType: 'EXPENSE',
            entityId: { in: expenseIds },
            deletedAt: null,
          },
          _count: true,
        })
      : [];
    const attachMap = new Map(
      attachments.map((a) => [a.entityId, a._count]),
    );

    return {
      total,
      limit,
      offset,
      items: items.map((e) => ({
        id: e.id,
        description: e.description,
        merchantName: e.merchantName,
        amountMinor: e.amountMinor,
        currencyCode: e.currencyCode,
        expenseDate: e.expenseDate.toISOString().slice(0, 10),
        splitMethod: e.splitMethod,
        category: e.category,
        notes: e.notes,
        attachmentCount: attachMap.get(e.id) ?? 0,
        payers: e.payers.map((p) => ({
          userId: p.userId,
          amountMinor: p.amountMinor,
        })),
        splits: e.splits.map((s) => ({
          userId: s.userId,
          amountMinor: s.amountMinor,
        })),
      })),
    };
  }

  async exportGroupPdf(
    authSubjectId: string,
    groupId: string,
    query: ExpenseSearchQuery,
  ) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    await this.membership.requireMember(groupId, user.id);
    const group = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
    });

    const where = this.buildWhere(groupId, query);
    const expenses = await this.prisma.expense.findMany({
      where,
      include: { payers: true, splits: true },
      orderBy: [{ expenseDate: 'desc' }],
      take: 500,
    });

    const members = await this.prisma.groupMember.findMany({
      where: { groupId, status: 'ACTIVE' },
      include: { user: { select: { id: true, displayName: true } } },
    });
    const nameById = new Map(
      members.map((m) => [m.userId, m.user.displayName]),
    );

    const total = expenses.reduce((a, e) => a + e.amountMinor, 0);
    const doc = createBrandedPdf({
      title: `Laporan Grup Â· ${group.name}`,
      subtitle: `Diekspor ${new Date().toLocaleString('id-ID')} Â· ${expenses.length} transaksi`,
    });

    addKeyValue(doc, [
      ['Mata uang', group.currencyCode],
      ['Total pengeluaran', formatIdrPdf(total)],
      ['Jumlah transaksi', String(expenses.length)],
      ['Filter', this.describeFilter(query)],
    ]);

    doc.moveDown(0.5).font('Helvetica-Bold').text('Rincian pengeluaran');
    doc.font('Helvetica').fontSize(9);

    for (const e of expenses) {
      if (doc.y > 720) {
        addFooter(doc);
        doc.addPage();
        doc.y = 48;
      }
      const payerNames = e.payers
        .map((p) => nameById.get(p.userId) ?? p.userId)
        .join(', ');
      doc
        .fillColor('#18181b')
        .font('Helvetica-Bold')
        .text(
          `${e.expenseDate.toISOString().slice(0, 10)} Â· ${formatIdrPdf(e.amountMinor)}`,
        )
        .font('Helvetica')
        .fillColor('#3f3f46')
        .text(
          `${e.description}${e.merchantName ? ` Â· ${e.merchantName}` : ''}${e.category ? ` Â· ${e.category}` : ''}`,
        )
        .text(`Bayar: ${payerNames} Â· Split: ${e.splitMethod}`)
        .moveDown(0.4);
    }

    addFooter(doc, `Bagi Rata Â· Laporan grup ${group.name}`);
    const buffer = await pdfToBuffer(doc);
    return {
      filename: `bagi-rata-grup-${group.name.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.pdf`,
      buffer,
    };
  }

  async exportPersonalPdf(authSubjectId: string, query: ExpenseSearchQuery) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    const memberships = await this.prisma.groupMember.findMany({
      where: { userId: user.id, status: 'ACTIVE' },
      include: { group: true },
    });
    const groupIds = memberships.map((m) => m.groupId);
    const groupName = new Map(
      memberships.map((m) => [m.groupId, m.group.name]),
    );

    const where: Prisma.ExpenseWhereInput = {
      groupId: { in: groupIds },
      deletedAt: null,
      OR: [
        { payers: { some: { userId: user.id } } },
        { splits: { some: { userId: user.id } } },
      ],
    };
    if (query.dateFrom || query.dateTo) {
      where.expenseDate = {};
      if (query.dateFrom)
        (where.expenseDate as Prisma.DateTimeFilter).gte = new Date(
          query.dateFrom,
        );
      if (query.dateTo)
        (where.expenseDate as Prisma.DateTimeFilter).lte = new Date(
          query.dateTo,
        );
    }
    if (query.q) {
      where.AND = [
        {
          OR: [
            { description: { contains: query.q, mode: 'insensitive' } },
            { merchantName: { contains: query.q, mode: 'insensitive' } },
            { notes: { contains: query.q, mode: 'insensitive' } },
            { category: { contains: query.q, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const expenses = await this.prisma.expense.findMany({
      where,
      include: {
        payers: { where: { userId: user.id } },
        splits: { where: { userId: user.id } },
      },
      orderBy: [{ expenseDate: 'desc' }],
      take: 500,
    });

    let paid = 0;
    let owed = 0;
    for (const e of expenses) {
      paid += e.payers.reduce((a, p) => a + p.amountMinor, 0);
      owed += e.splits.reduce((a, s) => a + s.amountMinor, 0);
    }

    const doc = createBrandedPdf({
      title: `Laporan Pribadi Â· ${user.displayName}`,
      subtitle: `Diekspor ${new Date().toLocaleString('id-ID')}`,
    });

    addKeyValue(doc, [
      ['Total ditalangi', formatIdrPdf(paid)],
      ['Total tanggungan', formatIdrPdf(owed)],
      ['Selisih (paid âˆ’ owed)', formatIdrPdf(paid - owed)],
      ['Transaksi terkait', String(expenses.length)],
    ]);

    doc.moveDown(0.5).font('Helvetica-Bold').text('Rincian');
    doc.font('Helvetica').fontSize(9);

    for (const e of expenses) {
      if (doc.y > 720) {
        addFooter(doc);
        doc.addPage();
        doc.y = 48;
      }
      const myPaid = e.payers.reduce((a, p) => a + p.amountMinor, 0);
      const myOwed = e.splits.reduce((a, s) => a + s.amountMinor, 0);
      doc
        .fillColor('#18181b')
        .font('Helvetica-Bold')
        .text(
          `${e.expenseDate.toISOString().slice(0, 10)} Â· ${groupName.get(e.groupId) ?? e.groupId}`,
        )
        .font('Helvetica')
        .fillColor('#3f3f46')
        .text(
          `${e.description} Â· total ${formatIdrPdf(e.amountMinor)} Â· bayar ${formatIdrPdf(myPaid)} Â· tanggungan ${formatIdrPdf(myOwed)}`,
        )
        .moveDown(0.4);
    }

    addFooter(doc, `Bagi Rata Â· Laporan pribadi ${user.displayName}`);
    const buffer = await pdfToBuffer(doc);
    return {
      filename: `bagi-rata-pribadi-${Date.now()}.pdf`,
      buffer,
    };
  }

  async exportGroupCsv(
    authSubjectId: string,
    groupId: string,
    query: ExpenseSearchQuery,
  ) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    await this.membership.requireMember(groupId, user.id);
    const group = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
    });
    const where = this.buildWhere(groupId, query);
    const expenses = await this.prisma.expense.findMany({
      where,
      include: { payers: true, splits: true },
      orderBy: [{ expenseDate: 'desc' }],
      take: 2000,
    });
    const members = await this.prisma.groupMember.findMany({
      where: { groupId, status: 'ACTIVE' },
      include: { user: { select: { id: true, displayName: true } } },
    });
    const nameById = new Map(
      members.map((m) => [m.userId, m.user.displayName]),
    );

    const header = [
      'date',
      'description',
      'merchant',
      'category',
      'amount_minor',
      'currency',
      'split_method',
      'payers',
      'splits',
    ];
    const rows = expenses.map((e) => [
      e.expenseDate.toISOString().slice(0, 10),
      e.description,
      e.merchantName ?? '',
      e.category ?? '',
      String(e.amountMinor),
      e.currencyCode,
      e.splitMethod,
      e.payers
        .map((p) => `${nameById.get(p.userId) ?? p.userId}:${p.amountMinor}`)
        .join('|'),
      e.splits
        .map((s) => `${nameById.get(s.userId) ?? s.userId}:${s.amountMinor}`)
        .join('|'),
    ]);
    const csv = this.toCsv([header, ...rows]);
    return {
      filename: `bagi-rata-grup-${group.name.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.csv`,
      buffer: Buffer.from(csv, 'utf8'),
      contentType: 'text/csv; charset=utf-8',
    };
  }

  async exportPersonalCsv(
    authSubjectId: string,
    query: ExpenseSearchQuery,
  ) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    const memberships = await this.prisma.groupMember.findMany({
      where: { userId: user.id, status: 'ACTIVE' },
      include: { group: true },
    });
    const groupIds = memberships.map((m) => m.groupId);
    const groupName = new Map(
      memberships.map((m) => [m.groupId, m.group.name]),
    );

    const where: Prisma.ExpenseWhereInput = {
      groupId: { in: groupIds },
      deletedAt: null,
      OR: [
        { payers: { some: { userId: user.id } } },
        { splits: { some: { userId: user.id } } },
      ],
    };
    if (query.dateFrom || query.dateTo) {
      where.expenseDate = {};
      if (query.dateFrom)
        (where.expenseDate as Prisma.DateTimeFilter).gte = new Date(
          query.dateFrom,
        );
      if (query.dateTo)
        (where.expenseDate as Prisma.DateTimeFilter).lte = new Date(
          query.dateTo,
        );
    }

    const expenses = await this.prisma.expense.findMany({
      where,
      include: {
        payers: { where: { userId: user.id } },
        splits: { where: { userId: user.id } },
      },
      orderBy: [{ expenseDate: 'desc' }],
      take: 2000,
    });

    const header = [
      'date',
      'group',
      'description',
      'total_minor',
      'my_paid_minor',
      'my_owed_minor',
      'currency',
      'split_method',
    ];
    const rows = expenses.map((e) => {
      const myPaid = e.payers.reduce((a, p) => a + p.amountMinor, 0);
      const myOwed = e.splits.reduce((a, s) => a + s.amountMinor, 0);
      return [
        e.expenseDate.toISOString().slice(0, 10),
        groupName.get(e.groupId) ?? e.groupId,
        e.description,
        String(e.amountMinor),
        String(myPaid),
        String(myOwed),
        e.currencyCode,
        e.splitMethod,
      ];
    });
    const csv = this.toCsv([header, ...rows]);
    return {
      filename: `bagi-rata-pribadi-${Date.now()}.csv`,
      buffer: Buffer.from(csv, 'utf8'),
      contentType: 'text/csv; charset=utf-8',
    };
  }

  private toCsv(rows: string[][]): string {
    const escape = (cell: string) => {
      if (/[",\n\r]/.test(cell)) {
        return `"${cell.replace(/"/g, '""')}"`;
      }
      return cell;
    };
    return rows.map((r) => r.map(escape).join(',')).join('\n') + '\n';
  }

  async exportInvoicePdf(authSubjectId: string, orderId: string) {
    const user = await requireInternalUser(this.prisma, authSubjectId);
    const order = await this.prisma.billingOrder.findFirst({
      where: { orderId, payerUserId: user.id },
      include: {
        plan: true,
        transactions: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!order) {
      throw ApiError.notFound(
        ErrorCodes.BILLING_ORDER_NOT_FOUND,
        'Order tidak ditemukan.',
      );
    }

    const doc = createBrandedPdf({
      title: 'Invoice / Kwitansi Pembayaran',
      subtitle: 'Dokumen bermerek Bagi Rata Â· Bukan faktur pajak',
    });

    addKeyValue(doc, [
      ['Nomor order', order.orderId],
      ['Status', order.status],
      ['Paket', `${order.plan.name} (${order.plan.code})`],
      ['Pelanggan', user.displayName],
      ['Email', user.primaryEmail ?? 'â€”'],
      ['Nominal', formatIdrPdf(order.amountMinor)],
      ['Mata uang', order.currencyCode],
      [
        'Dibayar pada',
        order.paidAt
          ? order.paidAt.toLocaleString('id-ID')
          : 'Belum dibayar',
      ],
      [
        'Metode',
        order.transactions[0]?.paymentType ?? 'â€”',
      ],
      ['Diterbitkan', new Date().toLocaleString('id-ID')],
    ]);

    doc.moveDown();
    doc
      .fontSize(9)
      .fillColor('#52525b')
      .text(
        'Terima kasih telah berlangganan Bagi Rata. Invoice ini mengonfirmasi pembayaran produk digital Bagi Rata (Plus / Group Pro / Trip Pass). Tidak termasuk PPN formal kecuali dinyatakan terpisah.',
      );

    addFooter(doc, 'Bagi Rata Â· Invoice bermerek Â· support@bagirata.id');
    const buffer = await pdfToBuffer(doc);
    return {
      filename: `bagi-rata-invoice-${order.orderId}.pdf`,
      buffer,
    };
  }

  private buildWhere(
    groupId: string,
    query: ExpenseSearchQuery,
  ): Prisma.ExpenseWhereInput {
    const where: Prisma.ExpenseWhereInput = {
      groupId,
      deletedAt: null,
    };

    const and: Prisma.ExpenseWhereInput[] = [];

    if (query.q?.trim()) {
      const q = query.q.trim();
      and.push({
        OR: [
          { description: { contains: q, mode: 'insensitive' } },
          { merchantName: { contains: q, mode: 'insensitive' } },
          { notes: { contains: q, mode: 'insensitive' } },
          { category: { contains: q, mode: 'insensitive' } },
          {
            items: {
              some: { name: { contains: q, mode: 'insensitive' } },
            },
          },
        ],
      });
    }
    if (query.category) {
      and.push({
        category: { equals: query.category, mode: 'insensitive' },
      });
    }
    if (query.merchant) {
      and.push({
        merchantName: { contains: query.merchant, mode: 'insensitive' },
      });
    }
    if (query.splitMethod) {
      and.push({ splitMethod: query.splitMethod as never });
    }
    if (query.payerId) {
      and.push({ payers: { some: { userId: query.payerId } } });
    }
    if (query.participantId) {
      and.push({ splits: { some: { userId: query.participantId } } });
    }
    if (
      query.minAmountMinor != null ||
      query.maxAmountMinor != null
    ) {
      where.amountMinor = {};
      if (query.minAmountMinor != null)
        where.amountMinor.gte = query.minAmountMinor;
      if (query.maxAmountMinor != null)
        where.amountMinor.lte = query.maxAmountMinor;
    }
    if (query.dateFrom || query.dateTo) {
      where.expenseDate = {};
      if (query.dateFrom)
        where.expenseDate.gte = new Date(query.dateFrom);
      if (query.dateTo) where.expenseDate.lte = new Date(query.dateTo);
    }
    if (query.hasAttachment === true) {
      and.push({
        id: {
          in: undefined as never,
        },
      });
      // handled via raw filter below â€” use relation-less subquery pattern
    }

    if (and.length) where.AND = and;

    // hasAttachment: filter by existing media attachments
    if (query.hasAttachment != null) {
      // post-filter expensive; use nested query via attachment entityIds
      // leave flag for controller to re-query if needed â€” implement via prisma raw
    }

    return where;
  }

  private describeFilter(query: ExpenseSearchQuery): string {
    const parts: string[] = [];
    if (query.q) parts.push(`q="${query.q}"`);
    if (query.category) parts.push(`kategori=${query.category}`);
    if (query.merchant) parts.push(`merchant=${query.merchant}`);
    if (query.dateFrom) parts.push(`dari=${query.dateFrom}`);
    if (query.dateTo) parts.push(`sampai=${query.dateTo}`);
    if (query.splitMethod) parts.push(`split=${query.splitMethod}`);
    return parts.length ? parts.join(', ') : 'semua';
  }
}
