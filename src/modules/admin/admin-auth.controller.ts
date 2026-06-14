import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AdminAuthService } from './admin-auth.service';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { CurrentAdmin } from './decorators/current-admin.decorator';
import type { CurrentAdminInfo } from './admin.types';
import {
  AdminLoginDto,
  AdminLogoutDto,
  AdminRefreshDto,
} from './dto/admin.dto';

@ApiTags('admin-auth')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: AdminLoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: AdminRefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Body() dto: AdminLogoutDto) {
    await this.auth.logout(dto.refreshToken);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard)
  me(@CurrentAdmin() admin: CurrentAdminInfo) {
    return admin;
  }
}
