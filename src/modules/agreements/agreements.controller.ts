import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReqContext } from '@platform/context/req-context.decorator';
import type { RequestContext } from '@platform/context/request-context';
import { AgreementsService } from './agreements.service';
import { CurrentAgreementQueryDto } from './dto/agreement.dto';

@ApiTags('agreements')
@Controller('agreements')
export class AgreementsController {
  constructor(private readonly agreements: AgreementsService) {}

  /** 현재 약관 (로그인/가입 화면에서 인증 전 조회). locale 본문, KO 폴백. */
  @ApiOperation({ summary: '현행 약관 조회' })
  @Get('current')
  current(
    @Query() q: CurrentAgreementQueryDto,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.agreements.getCurrent(q.type, ctx.locale);
  }
}
