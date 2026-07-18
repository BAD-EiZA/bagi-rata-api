import { createHash } from 'crypto';

export function midtransSignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  serverKey: string,
): string {
  return createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
    .digest('hex');
}

export function verifyMidtransSignature(input: {
  orderId: string;
  statusCode: string;
  grossAmount: string;
  signatureKey: string;
  serverKey: string;
}): boolean {
  const expected = midtransSignature(
    input.orderId,
    input.statusCode,
    input.grossAmount,
    input.serverKey,
  );
  return expected === input.signatureKey;
}

export function isPaidStatus(status: string, fraudStatus?: string | null): boolean {
  if (status === 'capture') {
    return !fraudStatus || fraudStatus === 'accept';
  }
  return status === 'settlement';
}
