export type EqualSplitInput = {
  totalMinor: number;
  participantIds: string[];
};

export type ExactSplitInput = {
  totalMinor: number;
  amounts: Array<{ userId: string; amountMinor: number }>;
};

export type PercentageSplitInput = {
  totalMinor: number;
  percentages: Array<{ userId: string; percentage: number }>;
};

export type SplitResult = Array<{ userId: string; amountMinor: number }>;

function assertPositiveTotal(totalMinor: number) {
  if (!Number.isInteger(totalMinor) || totalMinor <= 0) {
    throw new Error('TOTAL_INVALID');
  }
}

/** Deterministic equal split. Remainder goes to earliest stable-sorted userId. */
export function splitEqual(input: EqualSplitInput): SplitResult {
  assertPositiveTotal(input.totalMinor);
  const ids = [...new Set(input.participantIds)].sort();
  if (ids.length === 0) throw new Error('PARTICIPANTS_REQUIRED');

  const base = Math.floor(input.totalMinor / ids.length);
  let remainder = input.totalMinor - base * ids.length;

  return ids.map((userId) => {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    return { userId, amountMinor: base + extra };
  });
}

export function splitExact(input: ExactSplitInput): SplitResult {
  assertPositiveTotal(input.totalMinor);
  if (input.amounts.length === 0) throw new Error('PARTICIPANTS_REQUIRED');

  const map = new Map<string, number>();
  for (const row of input.amounts) {
    if (!Number.isInteger(row.amountMinor) || row.amountMinor < 0) {
      throw new Error('AMOUNT_INVALID');
    }
    map.set(row.userId, (map.get(row.userId) ?? 0) + row.amountMinor);
  }

  const sum = [...map.values()].reduce((a, b) => a + b, 0);
  if (sum !== input.totalMinor) throw new Error('SPLIT_SUM_MISMATCH');

  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([userId, amountMinor]) => ({ userId, amountMinor }));
}

/** Percentage must sum to 100. Uses largest remainder for deterministic cents. */
export function splitPercentage(input: PercentageSplitInput): SplitResult {
  assertPositiveTotal(input.totalMinor);
  if (input.percentages.length === 0) throw new Error('PARTICIPANTS_REQUIRED');

  const rows = [...input.percentages]
    .map((row) => ({
      userId: row.userId,
      percentage: row.percentage,
    }))
    .sort((a, b) => a.userId.localeCompare(b.userId));

  const pctSum = rows.reduce((a, b) => a + b.percentage, 0);
  if (Math.abs(pctSum - 100) > 0.0001) throw new Error('PERCENTAGE_SUM_INVALID');

  const floors = rows.map((row) => {
    const exact = (input.totalMinor * row.percentage) / 100;
    const floor = Math.floor(exact);
    return {
      userId: row.userId,
      amountMinor: floor,
      remainder: exact - floor,
    };
  });

  let leftover =
    input.totalMinor - floors.reduce((a, b) => a + b.amountMinor, 0);

  floors
    .slice()
    .sort((a, b) => {
      if (b.remainder !== a.remainder) return b.remainder - a.remainder;
      return a.userId.localeCompare(b.userId);
    })
    .forEach((row) => {
      if (leftover <= 0) return;
      const target = floors.find((f) => f.userId === row.userId);
      if (target) {
        target.amountMinor += 1;
        leftover -= 1;
      }
    });

  return floors.map(({ userId, amountMinor }) => ({ userId, amountMinor }));
}

/** Split amount equally among userIds (stable). */
export function splitAmountAmong(
  amountMinor: number,
  userIds: string[],
): SplitResult {
  if (amountMinor === 0) {
    return [...new Set(userIds)]
      .sort()
      .map((userId) => ({ userId, amountMinor: 0 }));
  }
  if (amountMinor < 0) throw new Error('AMOUNT_INVALID');
  return splitEqual({ totalMinor: amountMinor, participantIds: userIds });
}

export function sumMinor(
  rows: Array<{ amountMinor: number }>,
): number {
  return rows.reduce((a, b) => a + b.amountMinor, 0);
}

export function assertSplitsBalance(
  totalMinor: number,
  splits: SplitResult,
): void {
  if (sumMinor(splits) !== totalMinor) {
    throw new Error('SPLIT_SUM_MISMATCH');
  }
}
