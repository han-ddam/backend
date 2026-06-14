import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { AdminRolesGuard } from './guards/admin-roles.guard';
import { AdminRoles } from './decorators/admin-roles.decorator';
import { CreateAdminDto } from './dto/admin.dto';

/** Admin management — only SUPER_ADMIN can create other admins. */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(AdminJwtGuard, AdminRolesGuard)
export class AdminController {
  constructor(private readonly admins: AdminService) {}

  @Post('admins')
  @AdminRoles('SUPER_ADMIN')
  async createAdmin(@Body() dto: CreateAdminDto) {
    const admin = await this.admins.createAdmin(dto);
    return this.admins.toProfile(admin);
  }
}
