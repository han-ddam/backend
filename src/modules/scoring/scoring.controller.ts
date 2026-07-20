import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ScoringService } from './scoring.service';

@ApiTags('scoring')
@Controller('scoring')
export class ScoringController {
  constructor(private readonly scoring: ScoringService) {}

  /** 여행지 인증 점수 미리보기 — 게스트 허용(유저 무관 계산). */
  @ApiOperation({ summary: '인증 점수 미리보기' })
  @Get('places/:placeId')
  @ApiParam({
    name: 'placeId',
    type: String,
    example: '019eea71-dc41-7101-a57d-f6ebd3b80e43',
    description: '여행지 UUID (GET /api/places 목록에서 획득)',
  })
  @ApiQuery({
    name: 'type',
    enum: ['VISIT', 'PHOTO'],
    required: false,
    description: '인증 타입 (기본 PHOTO)',
  })
  @ApiOkResponse({
    description: '점수 미리보기 (전역 인터셉터가 {result: ...}로 감쌈)',
    schema: {
      example: {
        result: {
          action: 'CERT_PHOTO',
          basePoints: 15,
          typeWeight: 1.0,
          regionWeight: 1.5,
          rarityWeight: 1.0,
          eventMultiplier: 1.0,
          estimatedPoints: 22.5,
        },
      },
    },
  })
  preview(@Param('placeId', ParseUUIDPipe) placeId: string, @Query('type') type?: 'VISIT' | 'PHOTO') {
    return this.scoring.preview(placeId, type === 'VISIT' ? 'VISIT' : 'PHOTO');
  }
}
