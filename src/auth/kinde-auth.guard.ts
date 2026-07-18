import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { ApiError } from '../common/errors/api-error';
import { ErrorCodes } from '../common/errors/error-codes';
import { AuthenticatedRequest } from './auth.types';

@Injectable()
export class KindeAuthGuard implements CanActivate {
  private readonly logger = new Logger(KindeAuthGuard.name);
  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  private getJwks() {
    if (this.jwks) return this.jwks;
    const issuer = this.config.get<string>('KINDE_ISSUER_URL')?.replace(/\/$/, '');
    if (!issuer) {
      throw ApiError.unauthorized('Konfigurasi autentikasi belum siap.');
    }
    this.jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
    return this.jwks;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new ApiError(
        ErrorCodes.AUTH_TOKEN_MISSING,
        'Token autentikasi tidak ditemukan.',
        401,
      );
    }

    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      throw ApiError.unauthorized('Token autentikasi tidak valid.');
    }

    const issuer = this.config
      .get<string>('KINDE_ISSUER_URL')
      ?.replace(/\/$/, '');
    if (!issuer) {
      this.logger.error('KINDE_ISSUER_URL is not configured');
      throw ApiError.unauthorized('Konfigurasi autentikasi belum siap.');
    }

    const audience = this.config.get<string>('KINDE_AUDIENCE')?.trim();

    try {
      const { payload } = await jwtVerify(token, this.getJwks(), {
        issuer: [issuer, `${issuer}/`],
        ...(audience ? { audience } : {}),
      });

      const authSubjectId = typeof payload.sub === 'string' ? payload.sub : null;
      if (!authSubjectId) {
        throw ApiError.unauthorized('Claim subject tidak ditemukan.');
      }

      const email =
        typeof payload.email === 'string'
          ? payload.email
          : typeof (payload as { preferred_email?: string }).preferred_email ===
              'string'
            ? (payload as { preferred_email: string }).preferred_email
            : undefined;

      const name =
        typeof payload.name === 'string'
          ? payload.name
          : [payload.given_name, payload.family_name]
              .filter((p) => typeof p === 'string')
              .join(' ') || undefined;

      const picture =
        typeof payload.picture === 'string' ? payload.picture : undefined;

      request.authUser = {
        authSubjectId,
        email,
        name: name || undefined,
        picture,
      };
      return true;
    } catch (error) {
      this.logger.warn(
        `Token verification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw ApiError.unauthorized('Token autentikasi tidak valid.');
    }
  }
}
