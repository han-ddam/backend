import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import type { AuthUser } from '@modules/auth/auth.types';
import { ReqContext } from '@platform/context/req-context.decorator';
import type { RequestContext } from '@platform/context/request-context';
import { BookmarksService } from './bookmarks.service';
import { CreateBookmarkDto, BookmarkListQueryDto } from './dto/bookmark.dto';

@ApiTags('bookmarks')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard)
export class BookmarksController {
  constructor(private readonly bookmarks: BookmarksService) {}

  /** 찜 목록 (cursor). */
  @ApiOperation({ summary: '찜 목록 (cursor)' })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @Get('me/bookmarks')
  list(
    @CurrentUser() user: AuthUser,
    @Query() q: BookmarkListQueryDto,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.bookmarks.list({
      userId: user.userId,
      locale: ctx.locale,
      cursor: q.cursor,
      limit: q.limit,
    });
  }

  /** 찜 추가 (방문예정). */
  @ApiOperation({ summary: '찜 추가' })
  @Post('me/bookmarks')
  add(@CurrentUser() user: AuthUser, @Body() dto: CreateBookmarkDto) {
    return this.bookmarks.add(user.userId, dto.placeId);
  }

  /** 찜 해제 (멱등). */
  @ApiOperation({ summary: '찜 해제' })
  @Delete('me/bookmarks/:placeId')
  remove(@CurrentUser() user: AuthUser, @Param('placeId', ParseUUIDPipe) placeId: string) {
    return this.bookmarks.remove(user.userId, placeId);
  }
}
