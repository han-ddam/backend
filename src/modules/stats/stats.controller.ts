import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import type { AuthUser } from '@modules/auth/auth.types';
import { StatsService } from './stats.service';
import { RankingsQueryDto } from './dto/stats.dto';

@ApiTags('stats')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard)
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  /** 마이페이지 프로필 카드 (Lv/EXP/도감/순위). */
  @Get('me/profile')
  @ApiOperation({ summary: '내 프로필 (레벨/EXP/순위)' })
  profile(@CurrentUser() user: AuthUser) {
    return this.stats.profile(user.userId);
  }

  /** 전국 랭킹 (누적/이번 달). */
  @Get('rankings')
  @ApiOperation({ summary: '전국 랭킹 (누적/월간)' })
  @ApiQuery({ name: 'scope', required: false, enum: ['NATIONAL'] })
  @ApiQuery({ name: 'period', required: false, enum: ['CUMULATIVE', 'MONTHLY'] })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  rankings(@CurrentUser() user: AuthUser, @Query() q: RankingsQueryDto) {
    return this.stats.rankings(user.userId, q.scope, q.period, q.cursor, q.limit);
  }
}
