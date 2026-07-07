import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { OptionalJwtAuthGuard } from '@modules/auth/guards/optional-jwt-auth.guard';
import { OptionalUser } from '@modules/auth/decorators/optional-user.decorator';
import type { AuthUser } from '@modules/auth/auth.types';
import { ReqContext } from '@platform/context/req-context.decorator';
import type { RequestContext } from '@platform/context/request-context';
import { RegionsService } from './regions.service';
import { RegionPlacesQueryDto, RecommendedQueryDto } from './dto/region.dto';

@ApiTags('regions')
@Controller('regions')
@UseGuards(OptionalJwtAuthGuard)
export class RegionsController {
  constructor(private readonly regions: RegionsService) {}

  /** 시·도 코드표 — province 코드 발견용 (게스트 동일). */
  @Get()
  @ApiOkResponse({
    description: '시·도 17개 코드·이름 (전역 인터셉터가 {result: ...}로 감쌈)',
    schema: {
      example: {
        result: [
          { code: '1', name: '서울' },
          { code: '39', name: '제주특별자치도' },
        ],
      },
    },
  })
  listRegions(@ReqContext() ctx: RequestContext) {
    return this.regions.listRegions(ctx.locale);
  }

  /** 도(province) 상세 — 로그인 시 개인 수집 진행률 반영, 게스트는 0%. */
  @Get(':code')
  getRegion(
    @Param('code') code: string,
    @OptionalUser() user: AuthUser | null,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.regions.getRegion(code, user?.userId ?? null, ctx.locale);
  }

  /** 도(province) 내 여행지 목록 — cursor 페이지네이션, 방문 상태 필터. */
  @Get(':code/places')
  @ApiQuery({ name: 'status', required: false, enum: ['ALL', 'VISITED'] })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listPlaces(
    @Param('code') code: string,
    @Query() q: RegionPlacesQueryDto,
    @OptionalUser() user: AuthUser | null,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.regions.listPlaces({
      code,
      userId: user?.userId ?? null,
      onlyVisited: q.status === 'VISITED',
      locale: ctx.locale,
      cursor: q.cursor,
      limit: q.limit ?? 20,
    });
  }

  /** 도(province) 추천 여행지. */
  @Get(':code/recommended')
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listRecommended(
    @Param('code') code: string,
    @Query() q: RecommendedQueryDto,
    @OptionalUser() user: AuthUser | null,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.regions.listRecommended({
      code,
      userId: user?.userId ?? null,
      locale: ctx.locale,
      limit: q.limit,
    });
  }
}
