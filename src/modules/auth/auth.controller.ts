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
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthUser } from './auth.types';
import {
  EmailLoginDto,
  LogoutDto,
  OAuthLoginDto,
  RefreshDto,
} from './dto/auth.dto';

@ApiTags('auth')
// stricter limit on auth endpoints (brute-force protection): 10 req / 60s per IP
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('oauth/kakao')
  kakao(@Body() dto: OAuthLoginDto) {
    return this.auth.loginWithOAuth('KAKAO', dto.accessToken);
  }

  @Post('oauth/naver')
  naver(@Body() dto: OAuthLoginDto) {
    return this.auth.loginWithOAuth('NAVER', dto.accessToken);
  }

  /** Admin/staff only — there is no public email signup. */
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: EmailLoginDto) {
    return this.auth.loginWithEmail(dto.email, dto.password);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Body() dto: LogoutDto) {
    await this.auth.logout(dto.refreshToken);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}
