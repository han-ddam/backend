import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UsersService } from '@modules/users/users.service';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { AdminRolesGuard } from './guards/admin-roles.guard';
import { AdminRoles } from './decorators/admin-roles.decorator';
import { PageQueryDto, UpdateMemberStatusDto } from './dto/admin.dto';

/** Member management for admins (ADMIN and SUPER_ADMIN). */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/members')
@UseGuards(AdminJwtGuard, AdminRolesGuard)
@AdminRoles('SUPER_ADMIN', 'ADMIN')
export class MembersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@Query() query: PageQueryDto) {
    return this.users.listMembers(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.users.getMember(id);
  }

  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body() dto: UpdateMemberStatusDto) {
    return this.users.setStatus(id, dto.status);
  }
}
