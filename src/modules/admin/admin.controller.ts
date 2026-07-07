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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { AdminRolesGuard } from './guards/admin-roles.guard';
import { AdminRoles } from './decorators/admin-roles.decorator';
import { CreateAdminDto, PageQueryDto, UpdateAdminDto } from './dto/admin.dto';

/** Admin account management — SUPER_ADMIN only. */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/admins')
@UseGuards(AdminJwtGuard, AdminRolesGuard)
@AdminRoles('SUPER_ADMIN')
export class AdminController {
  constructor(private readonly admins: AdminService) {}

  @ApiOperation({ summary: '관리자 목록' })
  @Get()
  list(@Query() query: PageQueryDto) {
    return this.admins.listAdmins(query);
  }

  @ApiOperation({ summary: '관리자 상세' })
  @Get(':id')
  get(@Param('id') id: string) {
    return this.admins.getAdmin(id);
  }

  @ApiOperation({ summary: '관리자 생성' })
  @Post()
  async create(@Body() dto: CreateAdminDto) {
    const admin = await this.admins.createAdmin(dto);
    return this.admins.toProfile(admin);
  }

  @ApiOperation({ summary: '관리자 수정' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAdminDto) {
    return this.admins.updateAdmin(id, dto);
  }
}
