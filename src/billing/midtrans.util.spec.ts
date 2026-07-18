import {
  isPaidStatus,
  midtransSignature,
  verifyMidtransSignature,
} from './midtrans.util';

describe('midtrans signature', () => {
  it('verifies official formula', () => {
    const serverKey = 'SB-Mid-server-xxx';
    const orderId = 'order-1';
    const statusCode = '200';
    const grossAmount = '24900.00';
    const sig = midtransSignature(orderId, statusCode, grossAmount, serverKey);
    expect(
      verifyMidtransSignature({
        orderId,
        statusCode,
        grossAmount,
        signatureKey: sig,
        serverKey,
      }),
    ).toBe(true);
  });

  it('rejects bad signature', () => {
    expect(
      verifyMidtransSignature({
        orderId: 'a',
        statusCode: '200',
        grossAmount: '1',
        signatureKey: 'nope',
        serverKey: 'key',
      }),
    ).toBe(false);
  });
});

describe('isPaidStatus', () => {
  it('accepts settlement', () => {
    expect(isPaidStatus('settlement')).toBe(true);
  });
  it('accepts capture with accept fraud', () => {
    expect(isPaidStatus('capture', 'accept')).toBe(true);
  });
  it('rejects pending', () => {
    expect(isPaidStatus('pending')).toBe(false);
  });
});
