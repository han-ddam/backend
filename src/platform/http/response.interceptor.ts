import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * 성공 응답을 `{ result }` 로 감싼다 (에러 필드 없음).
 * 204(void) 처럼 본문이 undefined 면 그대로 두어 빈 응답 유지.
 */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next
      .handle()
      .pipe(map((data) => (data === undefined ? undefined : { result: data })));
  }
}
