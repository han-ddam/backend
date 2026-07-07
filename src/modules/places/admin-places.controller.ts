import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminJwtGuard } from '@modules/admin/guards/admin-jwt.guard';
import { AdminRolesGuard } from '@modules/admin/guards/admin-roles.guard';
import { AdminRoles } from '@modules/admin/decorators/admin-roles.decorator';
import { PlacesService } from './places.service';
import {
  AdminPlaceListQueryDto,
  CreatePlaceDto,
  UpdatePlaceStatusDto,
} from './dto/place.dto';

/** 여행지 큐레이션 (어드민). base_points·rarity_weight 수동 설정. */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/places')
@UseGuards(AdminJwtGuard, AdminRolesGuard)
@AdminRoles('SUPER_ADMIN', 'ADMIN')
export class AdminPlacesController {
  constructor(private readonly places: PlacesService) {}

  @Post()
  async create(@Body() dto: CreatePlaceDto) {
    const place = await this.places.createPlace(dto);
    return {
      id: place.id,
      regionCode: place.regionCode,
      basePoints: place.basePoints,
      rarityWeight: Number(place.rarityWeight),
    };
  }

  @Get()
  list(@Query() q: AdminPlaceListQueryDto) {
    return this.places.adminList(q);
  }

  /** 장소 상태 변경 — 사용자 제출 장소 승인/반려 포함. */
  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body() dto: UpdatePlaceStatusDto) {
    return this.places.setPlaceStatus(id, dto.status);
  }
}
