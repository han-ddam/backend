import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';
import { IdService } from '@platform/id/id.service';

/**
 * Adds a `X-Request-Id` correlation header to every response — reuses the
 * client's value if provided, otherwise generates one. Lets any request be
 * traced through logs, which is useful for auditing and incident response.
 */
@Injectable()
export class ResponseHeadersInterceptor implements NestInterceptor {
  constructor(private readonly id: IdService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const incoming = req.headers['x-request-id'];
    const requestId =
      typeof incoming === 'string' && incoming.length > 0
        ? incoming
        : this.id.generate();

    res.setHeader('X-Request-Id', requestId);

    return next.handle();
  }
}
