import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { RequestContext } from './request-context';

/** Injects the per-request RequestContext (locale + client). */
export const ReqContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestContext => {
    const req = ctx
      .switchToHttp()
      .getRequest<Request & { requestContext: RequestContext }>();
    return req.requestContext;
  },
);
