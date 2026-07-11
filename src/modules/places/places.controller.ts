import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ReqContext } from '@platform/context/req-context.decorator';
import type { RequestContext } from '@platform/context/request-context';
import { PlacesService } from './places.service';
import { PlaceListQueryDto, NearbyQueryDto } from './dto/place.dto';

@ApiTags('places')
@Controller('places')
export class PlacesController {
  constructor(private readonly places: PlacesService) {}

  /** 도(province) 내 여행지 목록 — cursor 페이지네이션, locale 적용. */
  @ApiOperation({ summary: '여행지 목록 (시·도별, cursor)' })
  @Get()
  @ApiQuery({
    name: 'province',
    required: true,
    type: String,
    example: '39',
    description: '시·도 코드 (GET /api/regions 로 조회. 예: 39=제주)',
  })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  list(@Query() q: PlaceListQueryDto, @ReqContext() ctx: RequestContext) {
    return this.places.listByProvince({
      province: q.province,
      locale: ctx.locale,
      cursor: q.cursor,
      limit: q.limit,
    });
  }

  /** GPS 근접 주변 여행지 — 인증 진입/위치 선택. 좌표는 판정용(미저장). */
  @ApiOperation({ summary: '주변 여행지 (GPS 근접, 거리순)' })
  @Get('nearby')
  @ApiQuery({ name: 'lat', required: true, type: Number, example: 38.2 })
  @ApiQuery({ name: 'lng', required: true, type: Number, example: 128.6 })
  @ApiQuery({ name: 'radius', required: false, type: Number, example: 2000 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  nearby(@Query() q: NearbyQueryDto, @ReqContext() ctx: RequestContext) {
    return this.places.nearby({
      lat: q.lat,
      lng: q.lng,
      radius: q.radius,
      limit: q.limit,
      locale: ctx.locale,
    });
  }

  /** 여행지 상세 (점수/가중치는 scoring 도메인에서 별도 조회). */
  @ApiOperation({ summary: '여행지 상세' })
  @Get(':id')
  get(@Param('id') id: string, @ReqContext() ctx: RequestContext) {
    return this.places.getPlace(id, ctx.locale);
  }
}
