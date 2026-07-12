import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import type { AuthUser } from '@modules/auth/auth.types';
import { ReqContext } from '@platform/context/req-context.decorator';
import type { RequestContext } from '@platform/context/request-context';
import { HomeService } from './home.service';
import { DiscoveryQueryDto } from './dto/home.dto';

@ApiTags('home')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard)
export class HomeController {
  constructor(private readonly home: HomeService) {}

  /** 홈 상단 요약 — 점수/순위/전체 진행도. */
  @Get('me/summary')
  @ApiOperation({ summary: '홈 요약 (점수/순위/진행도)' })
  summary(@CurrentUser() user: AuthUser) {
    return this.home.summary(user.userId);
  }

  /** 시·도별 진행 % (지도 색칠). */
  @Get('me/progress/sido')
  @ApiOperation({ summary: '시·도별 진행도' })
  progressSido(@CurrentUser() user: AuthUser, @ReqContext() ctx: RequestContext) {
    return this.home.progressSido(user.userId, ctx.locale);
  }

  /** 오늘의 추천 여행지 (미방문, 날짜 로테이션). */
  @Get('discovery/today')
  @ApiOperation({ summary: '오늘의 추천 여행지' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 3 })
  discoveryToday(
    @CurrentUser() user: AuthUser,
    @Query() q: DiscoveryQueryDto,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.home.discoveryToday(user.userId, ctx.locale, q.limit);
  }
}
