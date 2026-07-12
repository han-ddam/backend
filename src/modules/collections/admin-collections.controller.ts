import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminJwtGuard } from '@modules/admin/guards/admin-jwt.guard';
import { AdminRolesGuard } from '@modules/admin/guards/admin-roles.guard';
import { AdminRoles } from '@modules/admin/decorators/admin-roles.decorator';
import { CollectionsService } from './collections.service';
import {
  AddCollectionPlaceDto,
  AdminCollectionListQueryDto,
  CreateCollectionDto,
  UpdateCollectionDto,
} from './dto/collection.dto';

/** 테마 컬렉션 큐레이션 (어드민). */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/collections')
@UseGuards(AdminJwtGuard, AdminRolesGuard)
@AdminRoles('SUPER_ADMIN', 'ADMIN')
export class AdminCollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  @ApiOperation({ summary: '테마 등록 (어드민)' })
  @Post()
  create(@Body() dto: CreateCollectionDto) {
    return this.collections.adminCreate(dto);
  }

  @ApiOperation({ summary: '테마 목록 (어드민, offset)' })
  @Get()
  list(@Query() q: AdminCollectionListQueryDto) {
    return this.collections.adminList(q);
  }

  @ApiOperation({ summary: '테마 수정 (seq/status)' })
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCollectionDto) {
    return this.collections.adminUpdate(id, dto);
  }

  @ApiOperation({ summary: '테마 삭제' })
  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.collections.adminDelete(id);
    return { deleted: true };
  }

  @ApiOperation({ summary: '테마에 장소 추가' })
  @Post(':id/places')
  async addPlace(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddCollectionPlaceDto) {
    await this.collections.adminAddPlace(id, dto.placeId, dto.seq);
    return { added: true };
  }

  @ApiOperation({ summary: '테마에서 장소 제거' })
  @Delete(':id/places/:placeId')
  async removePlace(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('placeId', ParseUUIDPipe) placeId: string,
  ) {
    await this.collections.adminRemovePlace(id, placeId);
    return { removed: true };
  }
}
