import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthUser } from './auth.types';
import { LogoutDto, OAuthLoginDto, RefreshDto } from './dto/auth.dto';

@ApiTags('auth')
// stricter limit on auth endpoints (brute-force protection): 10 req / 60s per IP
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @ApiOperation({ summary: '카카오 로그인' })
  @Post('oauth/kakao')
  kakao(@Body() dto: OAuthLoginDto) {
    return this.auth.loginWithOAuth('KAKAO', dto.accessToken);
  }

  @ApiOperation({ summary: '네이버 로그인' })
  @Post('oauth/naver')
  naver(@Body() dto: OAuthLoginDto) {
    return this.auth.loginWithOAuth('NAVER', dto.accessToken);
  }

  @ApiOperation({ summary: '구글 로그인' })
  @Post('oauth/google')
  google(@Body() dto: OAuthLoginDto) {
    // accessToken 필드에 Google ID token 전달
    return this.auth.loginWithOAuth('GOOGLE', dto.accessToken);
  }

  @ApiOperation({ summary: '토큰 재발급' })
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @ApiOperation({ summary: '로그아웃' })
  @Post('logout')
  @HttpCode(204)
  async logout(@Body() dto: LogoutDto) {
    await this.auth.logout(dto.refreshToken);
  }

  @ApiOperation({ summary: '내 인증 정보' })
  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}
