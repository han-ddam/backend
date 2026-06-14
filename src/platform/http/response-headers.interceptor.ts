import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';
import { IdService } from '@platform/id/id.service';

export const API_VERSION = '0.1';

/**
 * Adds custom response headers to every request:
 *  - `X-Request-Id`: a correlation id (reuses the client's if provided, else generated)
 *    so any request can be traced through logs — useful for auditing/incident response.
 *  - `X-Api-Version`: the API version.
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
    res.setHeader('X-Api-Version', API_VERSION);

    return next.handle();
  }
}
