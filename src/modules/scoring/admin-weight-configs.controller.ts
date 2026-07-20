import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminJwtGuard } from '@modules/admin/guards/admin-jwt.guard';
import { AdminRolesGuard } from '@modules/admin/guards/admin-roles.guard';
import { AdminRoles } from '@modules/admin/decorators/admin-roles.decorator';
import { WeightConfigsService } from './weight-configs.service';
import { CreateWeightConfigDto, UpdateWeightConfigDto, WeightConfigListQueryDto } from './dto/weight-config.dto';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/weight-configs')
@UseGuards(AdminJwtGuard, AdminRolesGuard)
@AdminRoles('SUPER_ADMIN', 'ADMIN')
export class AdminWeightConfigsController {
  constructor(private readonly svc: WeightConfigsService) {}

  @ApiOperation({ summary: '가중치 프로필 생성' })
  @Post()
  create(@Body() dto: CreateWeightConfigDto) { return this.svc.adminCreate(dto); }

  @ApiOperation({ summary: '가중치 프로필 목록(offset)' })
  @Get()
  list(@Query() q: WeightConfigListQueryDto) { return this.svc.adminList(q); }

  @ApiOperation({ summary: '가중치 프로필 수정' })
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWeightConfigDto) { return this.svc.adminUpdate(id, dto); }

  @ApiOperation({ summary: '가중치 프로필 삭제' })
  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string) { await this.svc.adminDelete(id); return { deleted: true }; }
}
