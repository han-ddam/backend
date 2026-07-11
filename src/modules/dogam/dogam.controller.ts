import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import type { AuthUser } from '@modules/auth/auth.types';
import { ReqContext } from '@platform/context/req-context.decorator';
import type { RequestContext } from '@platform/context/request-context';
import { DogamService } from './dogam.service';
import { RecentQueryDto } from './dto/dogam.dto';

@ApiTags('dogam')
@ApiBearerAuth()
@Controller('me/dogam')
@UseGuards(JwtAuthGuard)
export class DogamController {
  constructor(private readonly dogam: DogamService) {}

  /** 전국 수집현황. */
  @Get('overview')
  @ApiOperation({ summary: '도감 전국 수집현황' })
  overview(@CurrentUser() user: AuthUser) {
    return this.dogam.overview(user.userId);
  }

  /** 시·도별 수집 카드. */
  @Get('regions')
  @ApiOperation({ summary: '도감 시·도별 수집현황' })
  regions(@CurrentUser() user: AuthUser, @ReqContext() ctx: RequestContext) {
    return this.dogam.regions(user.userId, ctx.locale);
  }

  /** 최근 수집 목록 (cursor). */
  @Get('recent')
  @ApiOperation({ summary: '도감 최근 수집 목록' })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  recent(
    @CurrentUser() user: AuthUser,
    @Query() q: RecentQueryDto,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.dogam.recent(user.userId, ctx.locale, q.cursor, q.limit);
  }
}
