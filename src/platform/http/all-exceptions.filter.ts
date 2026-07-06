import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

/**
 * 모든 예외를 `{ error:{ code, message } }` 로 통일 (성공은 result만, 실패는 error만).
 * - code = HTTP 상태 이름 (NOT_FOUND, BAD_REQUEST, UNAUTHORIZED ...)
 * - 예상치 못한 에러는 500 + 로그, 내부 정보는 노출하지 않음.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const code = HttpStatus[status] ?? 'ERROR';

    let message: string;
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      const raw =
        typeof body === 'string'
          ? body
          : ((body as { message?: unknown }).message ?? exception.message);
      message = Array.isArray(raw) ? raw.join(', ') : String(raw);
    } else {
      message = 'Internal server error';
      this.logger.error(exception);
    }

    res.status(status).json({ error: { code, message } });
  }
}
