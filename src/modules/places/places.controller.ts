import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ReqContext } from '@platform/context/req-context.decorator';
import type { RequestContext } from '@platform/context/request-context';
import { STORAGE, type StoragePort } from '@platform/storage/storage.port';
import { OptionalJwtAuthGuard } from '@modules/auth/guards/optional-jwt-auth.guard';
import { OptionalUser } from '@modules/auth/decorators/optional-user.decorator';
import type { AuthUser } from '@modules/auth/auth.types';
import { PlacesService } from './places.service';
import { CompositionsService } from './compositions.service';
import { CertificationsService } from '@modules/certifications/certifications.service';
import { PlaceListQueryDto, NearbyQueryDto, PlaceCertFeedQueryDto } from './dto/place.dto';

const SAFE_COMPOSITION_KEY = /^compositions\/[A-Za-z0-9_-]+\.(jpg|png|webp)$/;

@ApiTags('places')
@Controller('places')
export class PlacesController {
  constructor(
    private readonly places: PlacesService,
    private readonly compositionsService: CompositionsService,
    private readonly certs: CertificationsService,
    @Inject(STORAGE) private readonly storage: StoragePort,
  ) {}

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

  /** 여행지 구도 가이드 (공개). */
  @ApiOperation({ summary: '여행지 구도 가이드' })
  @Get('compositions/photos/:key(*)')
  async compositionPhoto(@Param('key') key: string, @Res() res: Response) {
    if (!SAFE_COMPOSITION_KEY.test(key)) throw new NotFoundException('photo not found');
    const file = await this.storage.read(key);
    if (!file) throw new NotFoundException('photo not found');
    res.setHeader('Content-Type', file.mime);
    file.stream.pipe(res);
  }

  @ApiOperation({ summary: '여행지 구도 가이드 목록' })
  @Get(':id/compositions')
  compositions(@Param('id', ParseUUIDPipe) id: string, @ReqContext() ctx: RequestContext) {
    return this.compositionsService.forPlace(id, ctx.locale);
  }

  /** 다른 여행자들의 공개 인증사진 피드 (PUBLIC·ACCEPTED, 최신순). */
  @ApiOperation({ summary: '여행지 인증사진 피드' })
  @Get(':id/certifications')
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 8 })
  certFeed(@Param('id', ParseUUIDPipe) id: string, @Query() q: PlaceCertFeedQueryDto) {
    return this.certs.publicFeedForPlace(id, q.cursor, q.limit ?? 8);
  }

  /** 여행지 상세 (점수/가중치는 scoring 도메인에서 별도 조회). */
  @ApiOperation({ summary: '여행지 상세' })
  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @OptionalUser() user: AuthUser | null,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.places.getPlace(id, ctx.locale, user?.userId ?? null);
  }
}
