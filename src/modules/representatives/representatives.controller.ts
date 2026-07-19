import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import type { AuthUser } from '@modules/auth/auth.types';
import { RepresentativeService } from './representatives.service';
import { SetRepresentativeDto } from './dto/representative.dto';

@ApiTags('representatives')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class RepresentativeController {
  constructor(private readonly svc: RepresentativeService) {}

  @ApiOperation({ summary: '장소 대표 지정용 내 사진 목록' })
  @Get('me/places/:placeId/photos')
  placePhotos(@Param('placeId', ParseUUIDPipe) placeId: string, @CurrentUser() u: AuthUser) {
    return this.svc.listPlacePhotos(u.userId, placeId);
  }

  @ApiOperation({ summary: '장소 대표사진 지정' })
  @Put('me/places/:placeId/representative')
  async setPlace(@Param('placeId', ParseUUIDPipe) placeId: string, @Body() dto: SetRepresentativeDto, @CurrentUser() u: AuthUser) {
    await this.svc.pinPlace(u.userId, placeId, dto.certImageId);
    return { pinned: true };
  }

  @ApiOperation({ summary: '장소 대표사진 해제' })
  @Delete('me/places/:placeId/representative')
  async unsetPlace(@Param('placeId', ParseUUIDPipe) placeId: string, @CurrentUser() u: AuthUser) {
    await this.svc.unpinPlace(u.userId, placeId);
    return { pinned: false };
  }

  @ApiOperation({ summary: '지역 대표 지정용 내 사진 목록' })
  @Get('me/regions/:code/photos')
  regionPhotos(@Param('code') code: string, @CurrentUser() u: AuthUser) {
    return this.svc.listRegionPhotos(u.userId, code);
  }

  @ApiOperation({ summary: '지역 대표사진 지정' })
  @Put('me/regions/:code/representative')
  async setRegion(@Param('code') code: string, @Body() dto: SetRepresentativeDto, @CurrentUser() u: AuthUser) {
    await this.svc.pinRegion(u.userId, code, dto.certImageId);
    return { pinned: true };
  }

  @ApiOperation({ summary: '지역 대표사진 해제' })
  @Delete('me/regions/:code/representative')
  async unsetRegion(@Param('code') code: string, @CurrentUser() u: AuthUser) {
    await this.svc.unpinRegion(u.userId, code);
    return { pinned: false };
  }
}
