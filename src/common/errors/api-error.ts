import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode, ErrorCodes } from './error-codes';

export type ApiErrorBody = {
  error: {
    code: ErrorCode | string;
    message: string;
    details?: Record<string, unknown>;
    requestId?: string;
  };
};

export class ApiError extends HttpException {
  constructor(
    code: ErrorCode | string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    details?: Record<string, unknown>,
  ) {
    const body: ApiErrorBody = {
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    };
    super(body, status);
  }

  static unauthorized(message = 'Autentikasi gagal.') {
    return new ApiError(
      ErrorCodes.AUTH_TOKEN_INVALID,
      message,
      HttpStatus.UNAUTHORIZED,
    );
  }

  static forbidden(message = 'Akses ditolak.') {
    return new ApiError(
      ErrorCodes.GROUP_ACCESS_DENIED,
      message,
      HttpStatus.FORBIDDEN,
    );
  }

  static notFound(code: string, message: string) {
    return new ApiError(code, message, HttpStatus.NOT_FOUND);
  }
}
