import { Body, Controller, Delete, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import type { AuthUser } from '@modules/auth/auth.types';
import { RatingsService } from './ratings.service';
import { SubmitRatingDto, SubmitReviewDto } from './dto/rating.dto';

@ApiTags('ratings')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard)
export class RatingsController {
  constructor(private readonly ratings: RatingsService) {}

  /** 별점 제출/수정 (로그인 회원). */
  @ApiOperation({ summary: '별점 제출/수정' })
  @Post('me/ratings')
  submit(@CurrentUser() user: AuthUser, @Body() dto: SubmitRatingDto) {
    return this.ratings.submit(user.userId, dto.placeId, dto.score);
  }

  /** 후기 작성/수정 (별점 선행 필수). */
  @ApiOperation({ summary: '후기 작성/수정' })
  @Post('me/reviews')
  review(@CurrentUser() user: AuthUser, @Body() dto: SubmitReviewDto) {
    return this.ratings.submitReview(user.userId, dto.placeId, dto.comment);
  }

  /** 후기 삭제 (멱등). */
  @ApiOperation({ summary: '후기 삭제' })
  @Delete('me/reviews/:placeId')
  deleteReview(@CurrentUser() user: AuthUser, @Param('placeId', ParseUUIDPipe) placeId: string) {
    return this.ratings.deleteReview(user.userId, placeId);
  }
}
