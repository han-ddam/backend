import { Body, Controller, Delete, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import type { AuthUser } from '@modules/auth/auth.types';
import { BookmarksService } from './bookmarks.service';
import { CreateBookmarkDto } from './dto/bookmark.dto';

@ApiTags('bookmarks')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard)
export class BookmarksController {
  constructor(private readonly bookmarks: BookmarksService) {}

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
