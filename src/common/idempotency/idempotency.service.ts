import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ApiError } from '../errors/api-error';
import { ErrorCodes } from '../errors/error-codes';

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  hashBody(body: unknown): string {
    return createHash('sha256')
      .update(JSON.stringify(body ?? null))
      .digest('hex');
  }

  async begin(
    userId: string,
    key: string | undefined,
    body: unknown,
  ): Promise<{ hit: true; response: unknown; status: number } | { hit: false; requestHash: string } | null> {
    if (!key?.trim()) return null;
    const requestHash = this.hashBody(body);
    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: { userId_key: { userId, key: key.trim() } },
    });
    if (existing) {
      if (existing.expiresAt < new Date()) {
        await this.prisma.idempotencyRecord.delete({ where: { id: existing.id } });
        return { hit: false, requestHash };
      }
      if (existing.requestHash !== requestHash) {
        throw new ApiError(
          ErrorCodes.IDEMPOTENCY_KEY_REUSED,
          'Idempotency-Key dipakai ulang dengan body berbeda.',
          409,
        );
      }
      return {
        hit: true,
        response: existing.responseBody,
        status: existing.responseCode,
      };
    }
    return { hit: false, requestHash };
  }

  async commit(
    userId: string,
    key: string | undefined,
    requestHash: string,
    responseCode: number,
    responseBody: unknown,
  ) {
    if (!key?.trim()) return;
    await this.prisma.idempotencyRecord.upsert({
      where: { userId_key: { userId, key: key.trim() } },
      create: {
        userId,
        key: key.trim(),
        requestHash,
        responseCode,
        responseBody: responseBody as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      update: {
        responseCode,
        responseBody: responseBody as Prisma.InputJsonValue,
      },
    });
  }
}
