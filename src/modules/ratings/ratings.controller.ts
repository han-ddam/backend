import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import type { AuthUser } from '@modules/auth/auth.types';
import { RatingsService } from './ratings.service';
import { SubmitRatingDto } from './dto/rating.dto';

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
}
