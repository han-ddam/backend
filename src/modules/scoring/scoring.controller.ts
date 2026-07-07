import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOkResponse, ApiParam, ApiTags } from '@nestjs/swagger';
import { ScoringService } from './scoring.service';

@ApiTags('scoring')
@Controller('scoring')
export class ScoringController {
  constructor(private readonly scoring: ScoringService) {}

  /** 여행지 인증 점수 미리보기 — 게스트 허용(유저 무관 계산). */
  @Get('places/:placeId')
  @ApiParam({ name: 'placeId', type: String })
  @ApiOkResponse({
    description: '점수 미리보기 (전역 인터셉터가 {result: ...}로 감쌈)',
    schema: {
      example: {
        result: {
          action: 'CERT_PHOTO',
          basePoints: 15,
          regionWeight: 1.5,
          rarityWeight: 1.0,
          eventMultiplier: 1.0,
          estimatedPoints: 22.5,
        },
      },
    },
  })
  preview(@Param('placeId', ParseUUIDPipe) placeId: string) {
    return this.scoring.preview(placeId);
  }
}
