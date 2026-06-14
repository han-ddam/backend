import { of } from 'rxjs';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { ResponseHeadersInterceptor } from './response-headers.interceptor';

function ctx(reqHeaders: Record<string, unknown>, res: { setHeader: jest.Mock }) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: reqHeaders }),
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
}

const next: CallHandler = { handle: () => of('ok') };

describe('ResponseHeadersInterceptor', () => {
  const id = { generate: jest.fn().mockReturnValue('generated-id') } as any;
  const interceptor = new ResponseHeadersInterceptor(id);

  it('generates a request id when none is provided', () => {
    const res = { setHeader: jest.fn() };
    interceptor.intercept(ctx({}, res), next);

    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'generated-id');
  });

  it('reuses an incoming x-request-id', () => {
    const res = { setHeader: jest.fn() };
    interceptor.intercept(ctx({ 'x-request-id': 'client-id' }, res), next);

    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'client-id');
  });
});
