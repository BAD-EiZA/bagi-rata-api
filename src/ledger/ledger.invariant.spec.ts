import { LedgerService } from './ledger.service';

describe('ledger expense deltas invariant', () => {
  const ledger = new LedgerService({} as never);

  it('sums to zero', () => {
    const deltas = ledger.buildExpenseDeltas(
      [{ userId: 'a', amountMinor: 10000 }],
      [
        { userId: 'a', amountMinor: 4000 },
        { userId: 'b', amountMinor: 6000 },
      ],
    );
    const sum = deltas.reduce((acc, d) => acc + d.amountMinorSigned, 0);
    expect(sum).toBe(0);
  });

  it('payer positive, ower negative', () => {
    const deltas = ledger.buildExpenseDeltas(
      [{ userId: 'payer', amountMinor: 300 }],
      [
        { userId: 'a', amountMinor: 100 },
        { userId: 'b', amountMinor: 100 },
        { userId: 'payer', amountMinor: 100 },
      ],
    );
    const map = new Map(deltas.map((d) => [d.userId, d.amountMinorSigned]));
    expect(map.get('payer')).toBe(200);
    expect(map.get('a')).toBe(-100);
    expect(map.get('b')).toBe(-100);
  });
});
