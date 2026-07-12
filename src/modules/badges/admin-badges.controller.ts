import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminJwtGuard } from '@modules/admin/guards/admin-jwt.guard';
import { AdminRolesGuard } from '@modules/admin/guards/admin-roles.guard';
import { AdminRoles } from '@modules/admin/decorators/admin-roles.decorator';
import { BadgesService } from './badges.service';
import { AdminBadgeListQueryDto, CreateBadgeDto, UpdateBadgeDto } from './dto/badge.dto';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/badges')
@UseGuards(AdminJwtGuard, AdminRolesGuard)
@AdminRoles('SUPER_ADMIN', 'ADMIN')
export class AdminBadgesController {
  constructor(private readonly badges: BadgesService) {}

  @ApiOperation({ summary: '뱃지 등록 (어드민)' })
  @Post()
  create(@Body() dto: CreateBadgeDto) {
    return this.badges.adminCreate(dto);
  }

  @ApiOperation({ summary: '뱃지 목록 (어드민, offset)' })
  @Get()
  list(@Query() q: AdminBadgeListQueryDto) {
    return this.badges.adminList(q);
  }

  @ApiOperation({ summary: '뱃지 수정' })
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBadgeDto) {
    return this.badges.adminUpdate(id, dto);
  }

  @ApiOperation({ summary: '뱃지 삭제' })
  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.badges.adminDelete(id);
    return { deleted: true };
  }
}
