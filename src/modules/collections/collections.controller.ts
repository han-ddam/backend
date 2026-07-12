import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { OptionalJwtAuthGuard } from '@modules/auth/guards/optional-jwt-auth.guard';
import { OptionalUser } from '@modules/auth/decorators/optional-user.decorator';
import type { AuthUser } from '@modules/auth/auth.types';
import { ReqContext } from '@platform/context/req-context.decorator';
import type { RequestContext } from '@platform/context/request-context';
import { CollectionsService } from './collections.service';
import { CollectionDetailQueryDto } from './dto/collection.dto';

@ApiTags('collections')
@Controller('collections')
export class CollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  /** 테마 상세 — 소속 장소 목록(수집 여부 포함), cursor. */
  @ApiOperation({ summary: '테마 상세 (장소 목록)' })
  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @OptionalUser() user: AuthUser | null,
    @Query() q: CollectionDetailQueryDto,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.collections.getCollectionDetail(id, ctx.locale, user?.userId ?? null, q.cursor, q.limit);
  }
}
