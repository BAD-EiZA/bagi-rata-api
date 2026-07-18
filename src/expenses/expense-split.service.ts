import { Injectable } from '@nestjs/common';
import { SplitMethod } from '@prisma/client';
import { ApiError } from '../common/errors/api-error';
import { ErrorCodes } from '../common/errors/error-codes';
import {
  splitAmountAmong,
  splitEqual,
  splitExact,
  splitPercentage,
  sumMinor,
} from '../common/money/split';
import { CreateExpenseDto, ExpenseItemDto } from './dto/create-expense.dto';

export type ComputedSplit = {
  userId: string;
  amountMinor: number;
  percentage?: number;
};

export type ComputedItem = {
  name: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  aiConfidence?: number;
  allocations: Array<{ userId: string; amountMinor: number }>;
};

@Injectable()
export class ExpenseSplitService {
  compute(dto: CreateExpenseDto): {
    payers: Array<{ userId: string; amountMinor: number }>;
    splits: ComputedSplit[];
    items: ComputedItem[];
  } {
    const payers = this.normalizePayers(dto);
    if (sumMinor(payers) !== dto.amountMinor) {
      throw new ApiError(
        ErrorCodes.EXPENSE_SPLIT_INVALID,
        'Jumlah kontribusi pembayar harus sama dengan total.',
        400,
        {
          differenceMinor: sumMinor(payers) - dto.amountMinor,
        },
      );
    }

    let splits: ComputedSplit[];
    let items: ComputedItem[] = [];

    try {
      switch (dto.splitMethod) {
        case SplitMethod.EQUAL: {
          const participantIds =
            dto.participantIds ??
            dto.splits?.map((s) => s.userId) ??
            [];
          splits = splitEqual({
            totalMinor: dto.amountMinor,
            participantIds,
          });
          break;
        }
        case SplitMethod.EXACT: {
          if (!dto.splits?.length) {
            throw new Error('SPLITS_REQUIRED');
          }
          splits = splitExact({
            totalMinor: dto.amountMinor,
            amounts: dto.splits.map((s) => ({
              userId: s.userId,
              amountMinor: s.amountMinor ?? 0,
            })),
          });
          break;
        }
        case SplitMethod.PERCENTAGE: {
          if (!dto.splits?.length) {
            throw new Error('SPLITS_REQUIRED');
          }
          splits = splitPercentage({
            totalMinor: dto.amountMinor,
            percentages: dto.splits.map((s) => ({
              userId: s.userId,
              percentage: s.percentage ?? 0,
            })),
          }).map((row) => {
            const pct = dto.splits?.find((s) => s.userId === row.userId)
              ?.percentage;
            return { ...row, percentage: pct };
          });
          break;
        }
        case SplitMethod.ITEM: {
          if (!dto.items?.length) {
            throw new ApiError(
              ErrorCodes.ITEM_ALLOCATION_INCOMPLETE,
              'Item wajib diisi untuk pembagian per item.',
              400,
            );
          }
          const computed = this.computeItemSplits(dto);
          splits = computed.splits;
          items = computed.items;
          break;
        }
        default:
          throw new Error('SPLIT_METHOD_INVALID');
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      const code =
        error instanceof Error ? error.message : 'SPLIT_INVALID';
      throw new ApiError(
        ErrorCodes.EXPENSE_SPLIT_INVALID,
        this.messageFor(code),
        400,
        { code },
      );
    }

    if (sumMinor(splits) !== dto.amountMinor) {
      throw new ApiError(
        ErrorCodes.EXPENSE_SPLIT_INVALID,
        'Jumlah pembagian harus sama dengan total pengeluaran.',
        400,
        { differenceMinor: sumMinor(splits) - dto.amountMinor },
      );
    }

    return { payers, splits, items };
  }

  private normalizePayers(dto: CreateExpenseDto) {
    const map = new Map<string, number>();
    for (const p of dto.payers) {
      map.set(p.userId, (map.get(p.userId) ?? 0) + p.amountMinor);
    }
    return [...map.entries()].map(([userId, amountMinor]) => ({
      userId,
      amountMinor,
    }));
  }

  private computeItemSplits(dto: CreateExpenseDto): {
    splits: ComputedSplit[];
    items: ComputedItem[];
  } {
    const items: ComputedItem[] = [];
    const owed = new Map<string, number>();

    for (const item of dto.items ?? []) {
      const computedItem = this.allocateItem(item);
      items.push(computedItem);
      for (const a of computedItem.allocations) {
        owed.set(a.userId, (owed.get(a.userId) ?? 0) + a.amountMinor);
      }
    }

    const itemsTotal = items.reduce((a, b) => a + b.lineTotalMinor, 0);
    const tax = dto.taxMinor ?? 0;
    const service = dto.serviceChargeMinor ?? 0;
    const tip = dto.tipMinor ?? 0;
    const discount = dto.discountMinor ?? 0;
    const extrasNet = tax + service + tip - discount;
    const expectedTotal = itemsTotal + extrasNet;

    if (expectedTotal !== dto.amountMinor) {
      // allow amountMinor as source of truth if subtotal fields omitted inconsistently
      if ((dto.subtotalMinor ?? itemsTotal) + extrasNet !== dto.amountMinor) {
        throw new ApiError(
          ErrorCodes.EXPENSE_SPLIT_INVALID,
          'Total item + biaya tambahan tidak sama dengan total pengeluaran.',
          400,
          {
            itemsTotal,
            extrasNet,
            amountMinor: dto.amountMinor,
          },
        );
      }
    }

    if (extrasNet !== 0) {
      const participantIds =
        dto.chargeParticipantIds ??
        dto.participantIds ??
        [...owed.keys()];
      if (participantIds.length === 0) {
        throw new Error('PARTICIPANTS_REQUIRED');
      }

      // proportional to item subtotals when possible
      const base = participantIds.map((userId) => ({
        userId,
        base: Math.max(owed.get(userId) ?? 0, 0),
      }));
      const baseSum = base.reduce((a, b) => a + b.base, 0);

      let extraRows: Array<{ userId: string; amountMinor: number }>;
      if (baseSum > 0 && extrasNet > 0) {
        extraRows = splitPercentage({
          totalMinor: extrasNet,
          percentages: base.map((b) => ({
            userId: b.userId,
            percentage: (b.base / baseSum) * 100,
          })),
        });
      } else if (extrasNet > 0) {
        extraRows = splitAmountAmong(extrasNet, participantIds);
      } else {
        // discount larger than tax etc — reduce proportionally
        const abs = Math.abs(extrasNet);
        const reduction =
          baseSum > 0
            ? splitPercentage({
                totalMinor: abs,
                percentages: base.map((b) => ({
                  userId: b.userId,
                  percentage: (b.base / baseSum) * 100,
                })),
              })
            : splitAmountAmong(abs, participantIds);
        extraRows = reduction.map((r) => ({
          userId: r.userId,
          amountMinor: -r.amountMinor,
        }));
      }

      for (const row of extraRows) {
        owed.set(row.userId, (owed.get(row.userId) ?? 0) + row.amountMinor);
      }
    }

    // Fix residual rounding to match amountMinor
    let splits = [...owed.entries()]
      .map(([userId, amountMinor]) => ({ userId, amountMinor }))
      .sort((a, b) => a.userId.localeCompare(b.userId));

    const diff = dto.amountMinor - sumMinor(splits);
    if (diff !== 0 && splits.length > 0) {
      splits = splits.map((s, idx) =>
        idx === 0 ? { ...s, amountMinor: s.amountMinor + diff } : s,
      );
    }

    return { splits, items };
  }

  private allocateItem(item: ExpenseItemDto): ComputedItem {
    const qty = item.quantity ?? 1;
    if (item.lineTotalMinor < 0 || item.unitPriceMinor < 0) {
      throw new Error('AMOUNT_INVALID');
    }

    const allocationUserIds = item.allocations.map((a) => a.userId);
    if (allocationUserIds.length === 0) {
      throw new ApiError(
        ErrorCodes.ITEM_ALLOCATION_INCOMPLETE,
        `Item "${item.name}" belum dialokasikan.`,
        400,
      );
    }

    const hasManual = item.allocations.some(
      (a) => a.amountMinor !== undefined && a.amountMinor !== null,
    );

    let allocations: Array<{ userId: string; amountMinor: number }>;
    if (hasManual) {
      if (
        item.allocations.some(
          (a) => a.amountMinor === undefined || a.amountMinor === null,
        )
      ) {
        throw new ApiError(
          ErrorCodes.ITEM_ALLOCATION_INCOMPLETE,
          `Item "${item.name}" alokasi manual harus lengkap.`,
          400,
        );
      }
      allocations = item.allocations.map((a) => ({
        userId: a.userId,
        amountMinor: a.amountMinor as number,
      }));
      if (sumMinor(allocations) !== item.lineTotalMinor) {
        throw new ApiError(
          ErrorCodes.ITEM_ALLOCATION_INCOMPLETE,
          `Alokasi item "${item.name}" tidak sama dengan total baris.`,
          400,
        );
      }
    } else {
      allocations = splitAmountAmong(
        item.lineTotalMinor,
        allocationUserIds,
      );
    }

    return {
      name: item.name.trim(),
      quantity: qty,
      unitPriceMinor: item.unitPriceMinor,
      lineTotalMinor: item.lineTotalMinor,
      aiConfidence: item.aiConfidence,
      allocations,
    };
  }

  private messageFor(code: string): string {
    switch (code) {
      case 'SPLIT_SUM_MISMATCH':
        return 'Jumlah pembagian harus sama dengan total pengeluaran.';
      case 'PERCENTAGE_SUM_INVALID':
        return 'Jumlah persentase harus 100%.';
      case 'PARTICIPANTS_REQUIRED':
        return 'Peserta pembagian wajib diisi.';
      case 'AMOUNT_INVALID':
        return 'Nominal tidak valid.';
      case 'TOTAL_INVALID':
        return 'Total harus lebih dari nol.';
      default:
        return 'Pembagian pengeluaran tidak valid.';
    }
  }
}
