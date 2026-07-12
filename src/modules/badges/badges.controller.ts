import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import type { AuthUser } from '@modules/auth/auth.types';
import { ReqContext } from '@platform/context/req-context.decorator';
import type { RequestContext } from '@platform/context/request-context';
import { BadgesService } from './badges.service';

@ApiTags('badges')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard)
export class BadgesController {
  constructor(private readonly badges: BadgesService) {}

  /** 내가 획득한 뱃지 목록. */
  @ApiOperation({ summary: '내 뱃지 목록' })
  @Get('me/badges')
  mine(@CurrentUser() user: AuthUser, @ReqContext() ctx: RequestContext) {
    return this.badges.listMine(user.userId, ctx.locale);
  }
}
