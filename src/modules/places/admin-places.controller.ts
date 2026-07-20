import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminJwtGuard } from '@modules/admin/guards/admin-jwt.guard';
import { AdminRolesGuard } from '@modules/admin/guards/admin-roles.guard';
import { AdminRoles } from '@modules/admin/decorators/admin-roles.decorator';
import { MIME_EXT } from '@platform/storage/storage.port';
import { PlacesService } from './places.service';
import { CompositionsService } from './compositions.service';
import {
  AdminPlaceListQueryDto,
  CreateCompositionDto,
  CreatePlaceDto,
  UpdatePlaceStatusDto,
} from './dto/place.dto';
import { AssignWeightConfigDto } from '@modules/scoring/dto/weight-config.dto';

const MAX_BYTES = 10 * 1024 * 1024;

/** 여행지 큐레이션 (어드민). base_points·rarity_weight 수동 설정. */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/places')
@UseGuards(AdminJwtGuard, AdminRolesGuard)
@AdminRoles('SUPER_ADMIN', 'ADMIN')
export class AdminPlacesController {
  constructor(
    private readonly places: PlacesService,
    private readonly compositions: CompositionsService,
  ) {}

  @ApiOperation({ summary: '여행지 등록 (어드민)' })
  @Post()
  async create(@Body() dto: CreatePlaceDto) {
    const place = await this.places.createPlace(dto);
    return {
      id: place.id,
      regionCode: place.regionCode,
      basePoints: place.basePoints,
      rarityWeight: Number(place.rarityWeight),
    };
  }

  @ApiOperation({ summary: '여행지 목록 (어드민)' })
  @Get()
  list(@Query() q: AdminPlaceListQueryDto) {
    return this.places.adminList(q);
  }

  /** 장소 상태 변경 — 사용자 제출 장소 승인/반려 포함. */
  @ApiOperation({ summary: '여행지 상태 변경 (승인/반려)' })
  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body() dto: UpdatePlaceStatusDto) {
    return this.places.setPlaceStatus(id, dto.status);
  }

  @ApiOperation({ summary: 'place에 가중치 프로필 연결/해제 (어드민)' })
  @Patch(':id/weight-config')
  setWeightConfig(@Param('id') id: string, @Body() dto: AssignWeightConfigDto) {
    return this.places.adminSetWeightConfig(id, dto.configId);
  }

  @ApiOperation({ summary: '여행지 대표 이미지 업로드 (어드민)' })
  @ApiConsumes('multipart/form-data')
  @Post(':id/image')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES } }))
  async uploadImage(@Param('id') id: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('file is required');
    if (!MIME_EXT[file.mimetype]) throw new BadRequestException('unsupported image type');
    return this.places.adminUploadImage(id, file.buffer, file.mimetype);
  }

  @ApiOperation({ summary: '여행지 대표 이미지 삭제 (어드민)' })
  @Delete(':id/image')
  deleteImage(@Param('id') id: string) {
    return this.places.adminDeleteImage(id);
  }

  @ApiOperation({ summary: '구도 예시 이미지 업로드 (어드민)' })
  @ApiConsumes('multipart/form-data')
  @Post(':id/compositions/photos')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES } }))
  async uploadComposition(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('file is required');
    if (!MIME_EXT[file.mimetype]) throw new BadRequestException('unsupported image type');
    return this.compositions.uploadPhoto(file.buffer, file.mimetype);
  }

  @ApiOperation({ summary: '구도 등록 (어드민)' })
  @Post(':id/compositions')
  createComposition(@Param('id') id: string, @Body() dto: CreateCompositionDto) {
    return this.compositions.adminCreate(id, dto);
  }

  @ApiOperation({ summary: '구도 목록 (어드민)' })
  @Get(':id/compositions')
  listCompositions(@Param('id') id: string) {
    return this.compositions.adminList(id);
  }

  @ApiOperation({ summary: '구도 삭제 (어드민)' })
  @Delete('compositions/:compositionId')
  deleteComposition(@Param('compositionId') compositionId: string) {
    return this.compositions.adminDelete(compositionId);
  }
}
