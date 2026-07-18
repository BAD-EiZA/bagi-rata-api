import { UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ApiError } from '../errors/api-error';
import { ErrorCodes } from '../errors/error-codes';

export async function requireInternalUser(
  prisma: PrismaService,
  authSubjectId: string,
) {
  const user = await prisma.user.findUnique({ where: { authSubjectId } });
  if (!user || user.status === UserStatus.DELETED) {
    throw ApiError.notFound(
      ErrorCodes.USER_NOT_FOUND,
      'Profil belum di-bootstrap. Panggil POST /v1/me/bootstrap dulu.',
    );
  }
  return user;
}
