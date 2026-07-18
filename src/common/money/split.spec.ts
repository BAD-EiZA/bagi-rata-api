import {
  splitEqual,
  splitExact,
  splitPercentage,
  sumMinor,
} from './split';

describe('splitEqual', () => {
  it('splits evenly', () => {
    const result = splitEqual({
      totalMinor: 30000,
      participantIds: ['b', 'a'],
    });
    expect(sumMinor(result)).toBe(30000);
    expect(result).toEqual([
      { userId: 'a', amountMinor: 15000 },
      { userId: 'b', amountMinor: 15000 },
    ]);
  });

  it('allocates remainder deterministically', () => {
    const result = splitEqual({
      totalMinor: 100,
      participantIds: ['c', 'a', 'b'],
    });
    expect(sumMinor(result)).toBe(100);
    expect(result).toEqual([
      { userId: 'a', amountMinor: 34 },
      { userId: 'b', amountMinor: 33 },
      { userId: 'c', amountMinor: 33 },
    ]);
  });
});

describe('splitExact', () => {
  it('accepts matching amounts', () => {
    const result = splitExact({
      totalMinor: 1000,
      amounts: [
        { userId: 'a', amountMinor: 400 },
        { userId: 'b', amountMinor: 600 },
      ],
    });
    expect(sumMinor(result)).toBe(1000);
  });

  it('rejects mismatch', () => {
    expect(() =>
      splitExact({
        totalMinor: 1000,
        amounts: [{ userId: 'a', amountMinor: 400 }],
      }),
    ).toThrow('SPLIT_SUM_MISMATCH');
  });
});

describe('splitPercentage', () => {
  it('splits 50/50', () => {
    const result = splitPercentage({
      totalMinor: 10001,
      percentages: [
        { userId: 'b', percentage: 50 },
        { userId: 'a', percentage: 50 },
      ],
    });
    expect(sumMinor(result)).toBe(10001);
  });

  it('rejects non-100', () => {
    expect(() =>
      splitPercentage({
        totalMinor: 1000,
        percentages: [{ userId: 'a', percentage: 40 }],
      }),
    ).toThrow('PERCENTAGE_SUM_INVALID');
  });
});
