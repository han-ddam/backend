import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Body,
  NotFoundException,
  ParseUUIDPipe,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '@modules/auth/guards/optional-jwt-auth.guard';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import { OptionalUser } from '@modules/auth/decorators/optional-user.decorator';
import type { AuthUser } from '@modules/auth/auth.types';
import { CertificationsService } from './certifications.service';
import { SubmitCertificationDto } from './dto/certification.dto';
import { STORAGE, type StoragePort, MIME_EXT } from './storage/storage.port';
import { Inject } from '@nestjs/common';

const MAX_BYTES = 10 * 1024 * 1024;

@ApiTags('certifications')
@Controller()
export class CertificationsController {
  constructor(
    private readonly certs: CertificationsService,
    @Inject(STORAGE) private readonly storage: StoragePort,
  ) {}

  /** 인증 사진 업로드 (1단계). */
  @Post('me/certifications/photos')
  @ApiBearerAuth()
  @ApiOperation({ summary: '인증 사진 업로드' })
  @ApiConsumes('multipart/form-data')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('file is required');
    if (!MIME_EXT[file.mimetype]) throw new BadRequestException('unsupported image type');
    if (file.size > MAX_BYTES) throw new BadRequestException('file too large (max 10MB)');
    return this.certs.uploadPhoto(file.buffer, file.mimetype);
  }

  /** 방문 인증 제출 (2단계) — 동기 근접판정 후 비동기 검증 큐로. */
  @Post('me/certifications')
  @ApiBearerAuth()
  @ApiOperation({ summary: '방문 인증 제출 (근접판정 후 비동기 검증)' })
  @UseGuards(JwtAuthGuard)
  submit(@Body() dto: SubmitCertificationDto, @CurrentUser() user: AuthUser) {
    return this.certs.submit(user.userId, dto);
  }

  /** 인증 상태 조회 (폴링). */
  @Get('me/certifications/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: '인증 상태 조회' })
  @UseGuards(JwtAuthGuard)
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.certs.getCertification(user.userId, id);
  }

  /** 인증 사진 서빙 — PRIVATE은 본인만, PUBLIC은 게스트 포함. */
  @Get('certifications/photos/:key(*)')
  @ApiOperation({ summary: '인증 사진 서빙' })
  @UseGuards(OptionalJwtAuthGuard)
  async photo(
    @Param('key') key: string,
    @OptionalUser() user: AuthUser | null,
    @Res() res: Response,
  ) {
    const meta = await this.certs.getPhotoMeta(key, user?.userId ?? null);
    if (!meta) throw new NotFoundException('photo not found');
    const file = await this.storage.read(key);
    if (!file) throw new NotFoundException('photo not found');
    res.setHeader('Content-Type', file.mime);
    file.stream.pipe(res);
  }
}
