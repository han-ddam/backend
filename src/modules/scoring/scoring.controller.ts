import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import { ScoringService } from './scoring.service';

@ApiTags('scoring')
@Controller('scoring')
export class ScoringController {
  constructor(private readonly scoring: ScoringService) {}

  /** 여행지 인증 점수 미리보기 — 게스트 허용(유저 무관 계산). */
  @Get('places/:placeId')
  @ApiParam({ name: 'placeId', type: String })
  preview(@Param('placeId', ParseUUIDPipe) placeId: string) {
    return this.scoring.preview(placeId);
  }
}
