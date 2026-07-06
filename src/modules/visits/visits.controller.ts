import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import type { AuthUser } from '@modules/auth/auth.types';
import { VisitsService } from './visits.service';
import { CreateVisitDto } from './dto/visit.dto';

@ApiTags('visits')
@Controller('me/visits')
export class VisitsController {
  constructor(private readonly visits: VisitsService) {}

  /** 여행지 방문(수집) 기록 — 멱등. */
  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  record(@Body() dto: CreateVisitDto, @CurrentUser() user: AuthUser) {
    return this.visits.record(user.userId, dto.placeId);
  }
}
