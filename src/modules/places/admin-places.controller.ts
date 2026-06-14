import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminJwtGuard } from '@modules/admin/guards/admin-jwt.guard';
import { AdminRolesGuard } from '@modules/admin/guards/admin-roles.guard';
import { AdminRoles } from '@modules/admin/decorators/admin-roles.decorator';
import { PlacesService } from './places.service';
import { AdminPlaceListQueryDto, CreatePlaceDto } from './dto/place.dto';

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
}
