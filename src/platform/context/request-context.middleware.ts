import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { buildRequestContext, type RequestContext } from './request-context';

/** Attaches the parsed RequestContext to every incoming request. */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(
    req: Request & { requestContext?: RequestContext },
    _res: Response,
    next: NextFunction,
  ): void {
    req.requestContext = buildRequestContext(req.headers);
    next();
  }
}
