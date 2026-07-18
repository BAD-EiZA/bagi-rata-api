import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorCodes } from '../errors/error-codes';
import { ApiErrorBody } from '../errors/api-error';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { requestId?: string }>();
    const requestId = request.requestId ?? response.getHeader('x-request-id');

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ApiErrorBody = {
      error: {
        code: ErrorCodes.INTERNAL_ERROR,
        message: 'Terjadi kesalahan internal.',
        requestId: typeof requestId === 'string' ? requestId : undefined,
      },
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null &&
        'error' in exceptionResponse
      ) {
        body = exceptionResponse as ApiErrorBody;
        body.error.requestId =
          body.error.requestId ??
          (typeof requestId === 'string' ? requestId : undefined);
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        const payload = exceptionResponse as {
          message?: string | string[];
          error?: string;
        };
        const message = Array.isArray(payload.message)
          ? payload.message.join(', ')
          : (payload.message ?? exception.message);

        body = {
          error: {
            code:
              status === HttpStatus.TOO_MANY_REQUESTS
                ? ErrorCodes.RATE_LIMIT_EXCEEDED
                : ErrorCodes.VALIDATION_FAILED,
            message,
            requestId: typeof requestId === 'string' ? requestId : undefined,
          },
        };
      } else {
        body = {
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: String(exceptionResponse),
            requestId: typeof requestId === 'string' ? requestId : undefined,
          },
        };
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    } else {
      this.logger.error('Unknown exception', String(exception));
    }

    response.status(status).json(body);
  }
}
