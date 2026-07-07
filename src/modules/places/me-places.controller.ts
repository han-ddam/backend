import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import type { AuthUser } from '@modules/auth/auth.types';
import { PlacesService } from './places.service';
import { SubmitUserPlaceDto } from './dto/place.dto';

@ApiTags('places')
@Controller('me/places')
export class MePlacesController {
  constructor(private readonly places: PlacesService) {}

  /** 사용자 장소 제출 — 검수 후 공개. */
  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: '사용자 장소 제출 (검수 후 공개)' })
  @UseGuards(JwtAuthGuard)
  submit(@Body() dto: SubmitUserPlaceDto, @CurrentUser() user: AuthUser) {
    return this.places.submitUserPlace(user.userId, dto);
  }
}
