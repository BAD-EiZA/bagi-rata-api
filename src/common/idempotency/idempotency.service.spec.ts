import { IdempotencyService } from './idempotency.service';

describe('IdempotencyService', () => {
  const record = {
    id: 'record-1',
    requestHash: '',
    responseBody: { id: 'expense-1' },
    responseCode: 201,
    expiresAt: new Date(Date.now() + 60_000),
  };
  const prisma = {
    idempotencyRecord: {
      findUnique: jest.fn(),
      delete: jest.fn(),
      upsert: jest.fn(),
    },
  };
  const service = new IdempotencyService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('replays a completed mutation with the same key and body', async () => {
    prisma.idempotencyRecord.findUnique.mockResolvedValue({
      ...record,
      requestHash: service.hashBody({ amountMinor: 100 }),
    });

    await expect(
      service.begin('user-1', 'mutation-1', { amountMinor: 100 }),
    ).resolves.toEqual({
      hit: true,
      response: { id: 'expense-1' },
      status: 201,
    });
  });

  it('rejects reuse with a different body', async () => {
    prisma.idempotencyRecord.findUnique.mockResolvedValue({
      ...record,
      requestHash: service.hashBody({ amountMinor: 100 }),
    });

    await expect(
      service.begin('user-1', 'mutation-1', { amountMinor: 200 }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('stores the response under the trimmed mutation key', async () => {
    await service.commit('user-1', ' mutation-1 ', 'hash', 201, {
      id: 'expense-1',
    });

    expect(prisma.idempotencyRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_key: { userId: 'user-1', key: 'mutation-1' } },
      }),
    );
  });
});
