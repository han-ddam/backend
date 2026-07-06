import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { ReqContext } from '@platform/context/req-context.decorator';
import type { RequestContext } from '@platform/context/request-context';
import { PlacesService } from './places.service';
import { PlaceListQueryDto } from './dto/place.dto';

@ApiTags('places')
@Controller('places')
export class PlacesController {
  constructor(private readonly places: PlacesService) {}

  /** 도(province) 내 여행지 목록 — cursor 페이지네이션, locale 적용. */
  @Get()
  @ApiQuery({ name: 'province', required: true, type: String })
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

  /** 여행지 상세 (점수/가중치는 scoring 도메인에서 별도 조회). */
  @Get(':id')
  get(@Param('id') id: string, @ReqContext() ctx: RequestContext) {
    return this.places.getPlace(id, ctx.locale);
  }
}
