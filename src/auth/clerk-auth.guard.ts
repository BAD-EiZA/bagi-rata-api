import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { verifyToken } from '@clerk/backend';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { ApiError } from '../common/errors/api-error';
import { ErrorCodes } from '../common/errors/error-codes';
import { parseOrigins } from '../config/env.validation';
import { AuthenticatedRequest } from './auth.types';

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private readonly logger = new Logger(ClerkAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

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

    const secretKey = this.config.get<string>('CLERK_SECRET_KEY');
    if (!secretKey) {
      this.logger.error('CLERK_SECRET_KEY is not configured');
      throw ApiError.unauthorized('Konfigurasi autentikasi belum siap.');
    }

    const authorizedParties = parseOrigins(
      this.config.get<string>('CLERK_AUTHORIZED_PARTIES') ??
        this.config.get<string>('FRONTEND_ORIGINS'),
    );

    try {
      const jwtKey = this.config.get<string>('CLERK_JWT_KEY');
      const payload = await verifyToken(token, {
        secretKey,
        ...(jwtKey ? { jwtKey } : {}),
        ...(authorizedParties.length > 0
          ? { authorizedParties }
          : {}),
      });

      const clerkUserId = payload.sub;
      if (!clerkUserId) {
        throw ApiError.unauthorized('Claim subject tidak ditemukan.');
      }

      request.authUser = {
        clerkUserId,
        sessionId:
          typeof payload.sid === 'string' ? payload.sid : undefined,
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
