import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import type { AuthUser } from '@modules/auth/auth.types';
import { ReqContext } from '@platform/context/req-context.decorator';
import type { RequestContext } from '@platform/context/request-context';
import { CollectionsService } from './collections.service';
import { ThemesQueryDto, MyCollectionsQueryDto } from './dto/collection.dto';

@ApiTags('collections')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard)
export class MeCollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  /** 도감 테마별 탭 — 테마 컬렉션 진행률. */
  @ApiOperation({ summary: '도감 테마별 탭' })
  @Get('me/dogam/themes')
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  themes(
    @CurrentUser() user: AuthUser,
    @Query() q: ThemesQueryDto,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.collections.listThemesWithProgress(user.userId, ctx.locale, q.cursor, q.limit);
  }

  /** 마이페이지 도감 진행률 탭 — 지역+테마 합본. */
  @ApiOperation({ summary: '도감 진행률(지역+테마 합본)' })
  @Get('me/collections')
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  myCollections(
    @CurrentUser() user: AuthUser,
    @Query() q: MyCollectionsQueryDto,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.collections.listMyCollections(user.userId, ctx.locale, q.cursor, q.limit);
  }
}
